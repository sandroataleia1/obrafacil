# ADR-008: Domínio de Clientes — pessoa física/jurídica, endereços e contatos

## Status

Aceito

## Contexto

O piloto usa `localStorage` para Clientes (`apps/web/src/features/customers`)
com um modelo mínimo (`name`, `phone`, `email?`, `document?`). Este backend
cria o domínio real de `Customer` no Laravel/PostgreSQL — a substituição do
`localStorage` fica para um gate frontend futuro (FRONTEND-CLIENTS-01). Esta
rodada também precisa já suportar, estruturalmente, os dois recursos que
uma futura Ordem de Serviço vai precisar referenciar: múltiplos endereços e
múltiplos contatos por cliente.

## Decisão

* **`kind` (PF/PJ)**: enum PHP `CustomerKind` (`individual`/`company`),
  coluna string — nunca enum Postgres, mesma razão de todos os enums
  anteriores do projeto (novos valores não devem exigir migration).
* **`name` sempre obrigatório, nunca sobrescrito pelo backend** — mesmo
  para PJ. `legal_name`/`trade_name` são nullable; a futura consulta de
  CNPJ (BACKEND-04A) poderá sugerir um valor para `name`, mas isso é
  decisão do frontend/lookup, nunca um efeito colateral silencioso do
  backend.
* **`document` canônico (somente dígitos)**: normalizado em
  `prepareForValidation()` antes de qualquer validação — a API aceita
  tanto `123.456.789-09` quanto `12345678909`. `App\Rules\Cpf`/
  `App\Rules\Cnpj` implementam o algoritmo real de dígito verificador
  (não apenas comprimento), reutilizáveis. `App\Support\Document` também
  gera CPF/CNPJ válidos para factories/testes.
* **Documento não é obrigatório** — cadastro rápido (nome + telefone +
  endereço) precisa funcionar sem CPF/CNPJ, incluindo o fluxo futuro de
  criar cliente dentro de uma OS.
* **Unicidade de documento por empresa**: `CREATE UNIQUE INDEX ...
  (company_id, document) WHERE deleted_at IS NULL AND document IS NOT
  NULL`. Deliberadamente um **índice único parcial**, não uma constraint
  simples — exclui clientes soft-deleted, porque um documento pertencente
  a um cliente já excluído não está "em uso" em nenhum sentido prático;
  mantê-lo reservado para sempre bloquearia um recadastro legítimo sem
  benefício real. O mesmo documento pode existir em empresas diferentes
  (multi-tenant por natureza).
* **`phone`/`email` nullable**: telefone armazenado em E.164
  (`App\Rules\E164Phone`, reutilizada), nunca mascarado. E-mail
  normalizado (trim + lowercase) mas **não** globalmente único — uma
  empresa pode ter vários clientes/contatos compartilhando a mesma caixa.
* **Soft delete, nunca hard delete via API**: `DELETE
  /customers/{id}` usa `SoftDeletes`. Nenhum endpoint de restore nesta
  rodada. `customers.company_id` é `restrictOnDelete()` — a aplicação hoje
  nunca deleta uma empresa, mas o histórico de clientes nunca deve poder
  desaparecer via cascata caso isso mude.
* **`CustomerAddress`**: `label` (identificação amigável, ex. "Loja
  Centro"), `type` (enum PHP `CustomerAddressType`, metadado semântico),
  `complement` e `reference_point` são três campos deliberadamente
  distintos — nunca sobrepostos. `postal_code` canônico (8 dígitos),
  `state` canônico (2 letras maiúsculas, validado contra o conjunto fixo
  de 27 UFs em `App\Support\BrazilianStates` — nunca um serviço externo).
  `number` é string nullable (endereços podem ser S/N).
* **No máximo um endereço principal por cliente**: `CREATE UNIQUE INDEX
  ... (customer_id) WHERE is_primary = true` — um índice único parcial
  real do Postgres, não apenas uma regra de aplicação.
  `App\Customers\CustomerAddressService` é quem mantém essa invariante em
  operação normal (primeiro endereço vira principal automaticamente,
  trocar o principal desmarca o anterior atomicamente, não é possível
  desmarcar o único principal existente, não é possível excluir o
  principal havendo outros), mas a constraint é o que torna "dois
  principais" estruturalmente impossível mesmo sob um bug ou uma corrida.
* **`CustomerContact`** (adendo): mesma arquitetura de `CustomerAddress`
  — `App\Customers\CustomerContactService` espelha exatamente a lógica de
  principal único, com seu próprio índice único parcial
  (`customer_contacts (customer_id) WHERE is_primary = true`).
  `phone` e `whatsapp` são colunas separadas porque o número de ligação e
  o número de WhatsApp não são garantidamente o mesmo. `role`/`department`
  são texto livre, nunca um enum rígido — a variedade de funções
  (proprietário, engenheiro, financeiro, comprador...) é aberta por
  natureza. `active=false` é o mecanismo de "contato não vale mais, mas
  preserva histórico" — **sem SoftDeletes** nesta entidade: ao contrário
  de `Customer`, nada ainda referencia `CustomerContact` para histórico
  (nenhuma OS existe), então soft delete seria complexidade sem uso real
  hoje; se um caso genuíno de "preciso do contato deletado" surgir junto
  com a OS futura, essa é uma decisão de schema a ser tomada
  explicitamente naquele momento, não assumida agora.
* **Criação atômica**: `POST /customers` cria `Customer` + `addresses` +
  `contacts` em uma única transação (§37/§78) — falha em qualquer
  endereço ou contato reverte o cliente inteiro. Isso é o mesmo endpoint
  que o fluxo futuro "Nova OS → + Novo cliente" vai chamar (§39/§92-93) —
  nunca um endpoint paralelo tipo `/service-orders/create-customer`. Um
  cliente criado pela OS é um `Customer` real, idêntico ao criado pelo
  módulo Clientes.
* **`PUT /customers/{id}` nunca sincroniza endereços/contatos** (§38) —
  edita apenas os campos do próprio `Customer`. Endereços e contatos têm
  endpoints dedicados; isso evita a semântica perigosa de "snapshot
  completo" que uma OS futura, dependendo desses dados, tornaria
  arriscada (um PUT do cliente poderia silenciosamente apagar um endereço
  que uma OS já referenciava).
* **Proteção cross-customer/cross-tenant**: `{customer}` é resolvido por
  route-model-binding do Eloquent, que já respeita `CompanyScope` — um
  cliente de outra empresa é simplesmente não-resolvível (404
  estruturalmente, não por checagem manual). `{address}`/`{contact}` NUNCA
  são type-hinted como model diretamente nos controllers — são resolvidos
  via `$customer->addresses()->findOrFail($id)` /
  `$customer->contacts()->findOrFail($id)`, então um id de endereço/contato
  de outro cliente (mesmo na mesma empresa) lança `ModelNotFoundException`
  → 404 real, nunca uma edição/exclusão indevida.
* **Busca (`GET /customers?search=`)**: nome/razão social/nome
  fantasia/e-mail via `ILIKE`; documento/telefone comparados por dígitos
  via `regexp_replace` (aceita busca mascarada ou canônica); contatos
  (nome/e-mail/telefone/whatsapp) via `EXISTS`, nunca `JOIN` — um `JOIN`
  duplicaria a linha do cliente por contato correspondente, quebrando a
  paginação.

## Roadmap documentado (não implementado nesta rodada)

* **BACKEND-04A (CEP/CNPJ lookup)**: um provider externo (ViaCEP,
  BrasilAPI, ReceitaWS, etc.) **nunca escreve** `Customer`/
  `CustomerAddress` diretamente. CEP preenche apenas `postal_code`,
  `street`, `neighborhood`, `city`, `state` — nunca inventa `number`,
  `complement`, `reference_point` ou `label`. CNPJ pode sugerir
  `legal_name`, `trade_name`, `document`, telefone/e-mail quando
  disponíveis, e sugerir a criação de um `CustomerAddress` a partir do
  endereço retornado — mas sempre como sugestão que o usuário confirma
  antes de salvar, nunca uma escrita automática.
* **Ordem de Serviço futura**: vai referenciar `customer_id` +
  `customer_address_id` nullable + `customer_contact_id` nullable, **mais
  um snapshot textual completo** do endereço e do contato usados (nome,
  função, telefone, WhatsApp, e-mail, e os campos de endereço). Isso é
  obrigatório porque uma OS histórica não pode mudar de conteúdo se
  amanhã o contato trocar de telefone, ficar inativo, o contato/endereço
  principal mudar, ou o endereço for editado. O fluxo de UX planejado (não
  implementado): a tela de nova OS terá "+ Novo cliente" e "+ Novo
  contato" que criam registros reais em `customers`/`customer_contacts` —
  nunca um contato "exclusivo da OS" fora do cadastro do cliente.
* Quando `budgets`/`projects`/`service_orders` ganharem FK real para
  `customers`, eles devem continuar conseguindo preservar `customer_id`
  mesmo com o cliente soft-deleted — este gate não precisa impedir soft
  delete por relações que ainda não existem, mas a decisão já está
  registrada aqui para quando esses domínios forem migrados.

## Consequências

* Nenhuma chamada HTTP externa (CEP, CNPJ, Evolution) nesta rodada.
* `CustomerContact` não está ligado a `NotificationSettings`/
  `NotificationPreference` de forma alguma — o telefone/WhatsApp de um
  contato não é consentimento para notificações do ObraFácil, e cadastrar
  um contato nunca cria `NotificationEvent`/`NotificationDelivery`.
* `apps/web` não foi tocado — o `localStorage` atual de Clientes continua
  funcionando no piloto até o gate frontend dedicado.
