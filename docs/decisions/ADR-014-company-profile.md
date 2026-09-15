# ADR-014: Perfil comercial da Company

## Status

Aceito

## Contexto

Até este gate, `companies` só tinha `id`, `name`, `document` e `timezone`
— o suficiente para multi-tenancy e para o `Budget`/`ServiceOrder`
funcionarem, mas nada que sirva como identidade comercial: sem
razão social/nome fantasia separados, sem telefone/WhatsApp/e-mail
próprios da empresa, sem endereço institucional, sem logo.

Esses dados são pré-requisito de três funcionalidades futuras, nenhuma
delas implementada aqui:

* **PROPOSAL-DOC-01** — snapshot de Company dentro do `Budget` no momento
  do submit (o que exatamente congela ainda será decidido nesse gate
  futuro);
* PDF profissional da proposta (usa nome/logo/documento/endereço para
  montar o cabeçalho);
* uma tela de "Configurações da empresa" no frontend (fora de escopo
  deste gate — `apps/web` permanece zero tocado).

## Decisão

* **`name` continua sendo o nome de exibição do workspace/empresa** — não
  foi renomeado, não virou obrigatório ter `legal_name`/`trade_name`
  preenchidos. `legal_name` (razão social) e `trade_name` (nome
  fantasia) são campos novos, nullable, independentes de `name`.
* **Campos novos são todos nullable** (§2): `legal_name`, `trade_name`,
  `phone`, `whatsapp`, `email`, e o endereço institucional
  (`postal_code`, `street`, `number`, `complement`, `neighborhood`,
  `city`, `state`, `reference_point`). Uma Company recém-criada
  continua funcionando exatamente como hoje sem nunca ser forçada a
  preencher perfil comercial.
* **Um único endereço institucional na própria tabela `companies`** — não
  uma tabela de endereços separada (diferente de `CustomerAddress`, que
  suporta múltiplos endereços por Customer). A Company tem exatamente um
  endereço comercial neste momento do produto; se isso mudar, é uma
  migração e um ADR futuros, não uma antecipação especulativa agora.
* **`document` (CNPJ) sem unique index global** — o contrato atual de
  `Company` não tem essa regra, e este gate não a introduz (§18):
  compatibilidade com o que já está implantado é mais importante que uma
  regra de negócio ainda não pedida explicitamente. O formato é validado
  (dígito verificador real, via `App\Rules\Cnpj`, a mesma classe já usada
  por `Customer`), só a unicidade que não é.
* **Dados canônicos, nunca máscaras, no banco** (§3): `document` e
  `postal_code` são dígitos puros (`App\Support\Document::digitsOnly`,
  reaproveitado de `Customer`/lookups), `phone`/`whatsapp` são E.164
  (`App\Rules\E164Phone`, mesma regra de `Customer`/`NotificationSetting`),
  `state` é UF maiúscula validada contra `BrazilianStates::CODES`. Máscara
  de exibição é responsabilidade do frontend futuro — nunca persistida.
* **`timezone` ganha validação real pela primeira vez**: a coluna já
  existia (ADR anterior) mas nunca tinha um endpoint de escrita — o
  comentário da migration original dizia explicitamente "nothing writes
  to this column yet". Este é esse primeiro writer: valida contra
  `DateTimeZone::listIdentifiers()` via a regra nativa `timezone:all` do
  Laravel, não aceita string arbitrária. Default (`America/Sao_Paulo`) e
  coluna preservados sem alteração.
* **Endpoint singular, sem id na URL** (§5/§19): `GET`/`PUT
  /api/v1/company/profile`, atrás de `auth:sanctum` +
  `resolve-current-company` — mesmo padrão já estabelecido por
  `NotificationSettingsController`. A Company é exclusivamente a
  resolvida por `CurrentCompanyContext`; não existe (e nunca vai existir
  neste contrato) um jeito de passar `company_id` pela URL/payload e ler
  ou editar outra empresa — `id`/`company_id` são `prohibited` no PUT, e
  read/write cross-tenant é estruturalmente impossível, não apenas
  proibido por uma checagem.
* **Autorização owner/admin — a primeira deste tipo no código-base**: não
  havia nenhuma Policy/Gate antes deste gate para "apenas owner/admin",
  só o enum `CompanyRole` guardado no pivot `company_user`. A decisão foi
  não introduzir Policy/Gate do Laravel ainda (nenhum precedente no
  projeto), e sim um trait pequeno e explícito,
  `AuthorizesCompanyOwnerOrAdmin`, usado pelo `authorize()` de
  `UpdateCompanyProfileRequest`/`StoreCompanyLogoRequest`/
  `DestroyCompanyLogoRequest` — todos re-derivam o papel a partir da
  membership real do usuário autenticado para a Company já resolvida,
  nunca de um campo enviado pelo cliente. Introduzir uma Policy formal
  fica para quando um segundo caso de uso precisar do mesmo tipo de
  checagem em mais de um lugar.
* **Logo via Laravel Storage, disco `public`, path não previsível**
  (§11-14): `companies/{companyId}/logos/{uuid}.{ext}` — nunca o nome de
  arquivo original do upload, nunca um caminho vindo do browser. Só
  PNG/JPEG/WebP (nunca SVG — vetor de XSS/script embutido), validados
  tanto pela extensão declarada (`mimes`) quanto pelo conteúdo real via
  fileinfo (`mimetypes`), máximo 2MB. Banco guarda só `logo_path`
  (relativo); `CompanyProfileResource` deriva `logo_url` em tempo de
  leitura via `Storage::disk('public')->url()` — nunca uma URL absoluta
  persistida, então trocar de disco/domínio de storage no futuro (ex.:
  S3 com CDN) não exige migração de dados.
* **Troca de logo: armazenar → persistir → só então apagar o antigo**
  (§12) — se a persistência do novo `logo_path` falhar, o arquivo recém-
  gravado é removido e o erro propaga; o arquivo antigo só é apagado
  depois que o novo path está commitado com sucesso. Isso garante que o
  banco nunca aponta para um arquivo inexistente, nas duas direções.
  Delete é idempotente (§13): sem logo atual, chamar DELETE de novo
  continua 200, nunca 500.
* **Sem Budget snapshot, sem proposta pública, sem PDF neste gate**
  (§15/§16): `PublicProposalResource`, `ProposalController`,
  `proposal_token`, e o próprio `Budget` continuam absolutamente
  intocados. O que exatamente vai congelar da Company dentro de um
  Budget no momento do submit é uma decisão de **PROPOSAL-DOC-01**, não
  deste gate — este ADR só estabelece a fonte canônica que aquele gate
  vai consumir.
* **`/me` não incha** (§22): `MePayload`/`MeController` permanecem
  exatamente como estavam — perfil completo só existe no endpoint
  próprio (`GET /api/v1/company/profile`), nunca replicado ali.

## Consequências

* Nenhuma dependência nova — reutiliza `Illuminate\Support\Facades\Storage`
  (já configurado, nunca usado em `app/` antes deste gate) e as mesmas
  regras de validação (`Cnpj`, `E164Phone`, `BrazilianStates`) já
  provadas em `Customer`.
* O disco `public` precisa do symlink `storage:link` ativo em produção
  para `logo_url` resolver de fato — isso é operação de deploy, não
  código; não é necessário nesta fase 100% local.
* CNPJ sem unicidade global é uma lacuna conhecida e documentada (§18),
  não um esquecimento — se um caso de uso real pedir essa regra, é uma
  migration + índice parcial dedicados, no mesmo padrão já usado por
  `customers_company_document_unique`.
* `AuthorizesCompanyOwnerOrAdmin` é candidato natural a virar a base de
  uma Policy real assim que um segundo recurso (além de Profile) precisar
  da mesma checagem — decisão adiada deliberadamente, não descartada.
