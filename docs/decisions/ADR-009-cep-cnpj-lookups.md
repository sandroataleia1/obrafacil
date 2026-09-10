# ADR-009: Lookup de CEP (ViaCEP) e CNPJ (BrasilAPI)

## Status

Aceito

## Contexto

Cadastro de cliente (BACKEND-04) precisa, no frontend futuro
(FRONTEND-CLIENTS-01), de assistência para preencher endereço a partir de
CEP e dados cadastrais a partir de CNPJ. O frontend nunca deve conhecer
ViaCEP/BrasilAPI — todo acesso passa pela própria API do ObraFácil, que
atua como proxy read-only, autenticado e com contrato interno estável.

## Auditoria real dos providers (2026-09-10)

Feita via chamada HTTP real, fora da suíte automatizada (nenhuma chamada
real acontece nos testes, que usam exclusivamente `Http::fake()`).

**ViaCEP** — `GET https://viacep.com.br/ws/{cep}/json/`

CEP existente (`01001000`):
```json
{
  "cep": "01001-000",
  "logradouro": "Praça da Sé",
  "complemento": "lado ímpar",
  "unidade": "",
  "bairro": "Sé",
  "localidade": "São Paulo",
  "uf": "SP",
  "estado": "São Paulo",
  "regiao": "Sudeste",
  "ibge": "3550308",
  "gia": "1004",
  "ddd": "11",
  "siafi": "7107"
}
```
CEP inexistente porém bem formado (`99999999`): HTTP 200,
`{"erro": "true"}` — **`erro` é string**, não boolean.
Formato inválido (`123`): HTTP 400.

Campos efetivamente consumidos: `cep`, `logradouro`, `bairro`,
`localidade`, `uf`, `complemento` (mapeado para `provider_complement`,
nunca para o `complement` de um `CustomerAddress`). `unidade`, `estado`,
`regiao`, `ibge`, `gia`, `ddd`, `siafi` — nunca importados (§4).

**BrasilAPI** — `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}`

CNPJ público real, o mesmo usado na documentação oficial da BrasilAPI
(`19131243000197`, Open Knowledge Brasil):
```json
{
  "cnpj": "19131243000197",
  "razao_social": "OPEN KNOWLEDGE BRASIL",
  "nome_fantasia": "REDE PELO CONHECIMENTO LIVRE",
  "email": null,
  "ddd_telefone_1": "1123851939",
  "ddd_telefone_2": "",
  "cep": "01311902",
  "logradouro": "PAULISTA 37",
  "numero": "37",
  "complemento": "ANDAR 4",
  "bairro": "BELA VISTA",
  "municipio": "SAO PAULO",
  "uf": "SP",
  "qsa": [ ... ],
  "capital_social": 0,
  "cnae_fiscal": 9430800,
  "cnaes_secundarios": [ ... ],
  "regime_tributario": [ ... ],
  ...
}
```
CNPJ bem formado mas inexistente (`00000000000000`): HTTP 404,
`{"message": "CNPJ 00.000.000/0000-00 não encontrado.", "type": "not_found", "name": "NotFoundError"}`.
Formato inválido (`123`): HTTP 400,
`{"message": "...", "type": "bad_request", "name": "BadRequestError"}`.

Campos efetivamente consumidos: `cnpj`, `razao_social`, `nome_fantasia`,
`email`, `ddd_telefone_1` (DDD+número concatenados sem separador, ex.
`"1123851939"` = 10 dígitos), `cep`, `logradouro`, `numero`,
`complemento`, `bairro`, `municipio`, `uf`. **Nunca importados**: `qsa`
(sócios), `capital_social`, `cnae_fiscal`/`cnaes_secundarios`,
`regime_tributario`, `porte`, `natureza_juridica`, `situacao_cadastral`,
ou qualquer outro campo administrativo/tributário (§5).

## Decisão

* **Backend como proxy obrigatório**: o frontend nunca chama
  ViaCEP/BrasilAPI diretamente — apenas `GET /api/v1/lookups/cep` e
  `GET /api/v1/lookups/cnpj`, ambas `auth:sanctum` +
  `resolve-current-company` + rate limit (`lookups`, 30/min por usuário).
  Elimina SSRF por construção: o usuário só fornece CEP/CNPJ, nunca uma
  URL (§31).
* **Arquitetura de provider**: `App\Lookups\Contracts\PostalCodeProvider`
  e `CompanyRegistryProvider` são as únicas interfaces que o resto da
  aplicação conhece. `ViaCepPostalCodeProvider` e
  `BrasilApiCompanyRegistryProvider` são as implementações atuais,
  bindadas em `AppServiceProvider`. Trocar/adicionar um segundo provider
  (fallback futuro) é rebind, não uma mudança de call sites.
* **DTOs internos, nunca o shape do provider**:
  `PostalCodeLookupResult`/`CompanyRegistryLookupResult` (+
  `CompanyRegistryAddress`) são o único contrato que atravessa a fronteira
  do adapter — nenhum nome de campo do ViaCEP/BrasilAPI vaza para o
  domínio ou para a resposta HTTP.
* **Normalização e validação antes de qualquer chamada externa**: CEP
  normalizado para 8 dígitos (`Document::digitsOnly`), CNPJ normalizado +
  validado pelo algoritmo real de dígito verificador
  (`App\Rules\Cnpj`, reaproveitada do BACKEND-04) — um input local
  inválido nunca gasta uma chamada HTTP real (§7/§8, provado por
  H7/H12/R4).
* **Exceções de domínio com `render()` próprio**:
  `LookupNotFoundException` (404), `LookupUnavailableException` (503,
  cobre timeout/conexão/5xx/429 upstream) e
  `LookupInvalidResponseException` (503, resposta 2xx mas incompleta ou
  não-JSON) — cada uma sabe se renderizar, então o controller nunca
  interpreta HTTP cru do provider (§18).
* **Telefone**: só vira E.164 quando o valor local (DDD+número) tem
  exatamente 10 ou 11 dígitos — qualquer outra coisa vira `null`, nunca um
  número fabricado (§15).
* **E-mail**: normalizado (trim+lowercase) e validado via
  `filter_var(...,FILTER_VALIDATE_EMAIL)` — inválido/vazio vira `null`,
  sem derrubar o lookup inteiro por um campo secundário ruim (§16).
* **Cache global, nunca por tenant**: chave `lookups:cep:{cep}` /
  `lookups:cnpj:{cnpj}` — sem `company_id`/`user_id`, porque é dado
  cadastral público, idêntico para qualquer empresa. TTL de CEP (24h,
  praticamente nunca muda) mais longo que o de CNPJ (6h, dados de contato
  podem mudar com mais frequência). Só um resultado bem-sucedido é
  cacheado — timeout/5xx/resposta inválida nunca (§26-28, provado por
  C5).
* **Nenhuma persistência automática**: nem CEP nem CNPJ escrevem
  `Customer`/`CustomerAddress`/`CustomerContact` — o lookup é sugestão, o
  usuário confirma no FRONTEND-CLIENTS-01 (§11/§12, provado por H16).
* **Timeout curto e configurável** (`LOOKUP_HTTP_TIMEOUT=5`), **sem
  retry automático** — o usuário pode simplesmente tentar de novo; um
  cadastro nunca fica preso esperando um provider lento.

## Contrato para FRONTEND-CLIENTS-01 (documentado, não implementado aqui)

* CEP pode preencher `postal_code`, `street`, `neighborhood`, `city`,
  `state` de um `CustomerAddress` em edição — **nunca** `label`,
  `number`, `reference_point`. Se o provider devolver
  `provider_complement`, isso **nunca** deve sobrescrever um
  `complement` que o usuário já tenha digitado.
* CNPJ pode sugerir `legal_name`, `trade_name`, `document`, `phone`,
  `email` e os dados de endereço — mas `name` continua decisão explícita
  do frontend/usuário. Regra sugerida: se `trade_name` disponível, sugerir
  como `name`; senão, `legal_name`. O backend de lookup nunca decide isso
  por conta própria.
* Se o lookup falhar (404, 503, ou API indisponível), o formulário
  continua 100% preenchível manualmente — lookup é assistência, nunca
  pré-condição (§46).

## Consequências

* Nenhuma dependência nova — reutiliza o `Http` facade já usado por
  `EvolutionApiProvider` (BACKEND-03).
* Indisponibilidade de ViaCEP/BrasilAPI nunca impede cadastro manual de
  cliente — os dois providers são serviços externos, e a UI futura nunca
  bloqueia nessa dependência.
* Um segundo provider de CEP/CNPJ (fallback) é uma extensão futura
  natural da mesma interface — não requer mudança de contrato.
