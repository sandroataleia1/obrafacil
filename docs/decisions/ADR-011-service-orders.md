# ADR-011: Ordens de Serviço (core)

## Status

Aceito

## Contexto

O produto precisa de um jeito de registrar um atendimento/serviço real
executado para um cliente — visita técnica, manutenção, instalação — com
local de execução, contato no local, itens do catálogo comercial usados,
deslocamento cobrado e agendamento. Antes deste gate, `apps/api` não tinha
nenhum conceito de Ordem de Serviço; o único domínio de "trabalho" era
`Project` (Obra), que representa a gestão de uma obra inteira, não um
atendimento pontual.

## Decisão

### O.S. independe de Obra

* **`ServiceOrder` não tem `project_id`, ponto final.** A tabela
  `service_orders` não tem essa coluna; o model não tem relação `project()`;
  nenhum controller/service/request do domínio importa `App\Models\Project`
  em código real (testado estruturalmente — `ServiceOrderStructuralTest`).
  Um `project_id` no payload de criação é `prohibited` (422).
* Um cliente pode ter zero `Project` e dezenas de `ServiceOrder`. Os dois
  domínios convivem sem dependência hoje; um vínculo *opcional* futuro
  (Cliente → Project → O.S.) é um problema de gate futuro, não deste.
* `CustomerAddress.type = work_site` **não** cria nem implica a existência
  de um `Project` — é só um dos seis tipos de endereço possíveis
  (`residential`/`commercial`/`work_site`/`billing`/`delivery`/`other`),
  qualquer um deles pode ser o local de execução de uma O.S.

### Snapshots (Customer/Address/Contact/CatalogItem)

* `ServiceOrder` guarda uma cópia server-side, no momento da criação, de:
  nome/documento/telefone/e-mail do Customer; label/tipo/endereço completo
  do CustomerAddress; nome/cargo/departamento/telefones/e-mail do
  CustomerContact (quando selecionado). O frontend nunca envia esses
  campos — eles são `prohibited` no `StoreServiceOrderRequest`.
* `ServiceOrderItem` guarda uma cópia de `type`/`code`/`name`/`unit`/
  `description` do `CatalogItem` no momento da inserção — exatamente o
  contrato já previsto na seção "Contrato de snapshot futuro" da ADR-010.
* **Por quê**: um documento operacional (O.S.) não pode mudar
  retroativamente porque alguém editou o cadastro do cliente, o endereço,
  o contato, ou o preço/nome de um item do catálogo depois. Isso é testado
  exaustivamente em `ServiceOrderSnapshotApiTest` (H1-H10): renomear o
  cliente, trocar telefone, mudar cidade do endereço, apagar o endereço,
  trocar/inativar o contato, inativar/renomear/reprecificar o item do
  catálogo — nada disso altera uma O.S. já criada, nem mesmo depois de
  `completed`.
* `customer_address_id`/`customer_contact_id`/`catalog_item_id` são todos
  `nullOnDelete()` — perder a linha cadastral viva nunca pode apagar o
  snapshot histórico já copiado. `customer_id` continua `restrictOnDelete()`
  porque `Customer` é soft-delete (a linha sempre existe).
* No `POST`, `customer_address_id` é **obrigatório** (a O.S. sempre tem um
  local de execução real); `customer_contact_id` é opcional. Um contato
  `active=false` não pode ser *selecionado* (nem no create nem ao trocar
  via PUT) — mas um contato que já estava selecionado e foi inativado
  depois não invalida a O.S. existente (o nome dele já está no snapshot).

### Numeração sequencial por empresa

* `service_order_sequences` tem `company_id` como chave primária (não uma
  `id` separada) — isso faz `SELECT ... WHERE company_id = ? FOR UPDATE`
  travar exatamente uma linha por tenant, nunca bloqueando a alocação de
  outra empresa.
* `App\ServiceOrders\ServiceOrderNumberAllocator::allocate()` sempre roda
  **dentro da mesma transação** da criação da O.S. A primeira alocação de
  uma empresa (linha ainda não existe) é resolvida com um `INSERT`
  envolvido em `DB::transaction()` aninhado (SAVEPOINT real) — se outra
  requisição concorrente já criou a linha primeiro, o `23505` é capturado
  e ignorado, sem envenenar a transação externa; o `SELECT ... FOR UPDATE`
  logo depois sempre encontra a linha, de quem quer que tenha vencido o
  insert.
* Nunca `COUNT()+1` nem `MAX(number)+1` — provado em `N4` (apagar a única
  O.S. existente e alocar de novo nunca repete o número).
* `number` é `BIGINT`; a API formata como `OS-%06d` (`ServiceOrder::
  formattedNumber()`), único real via `UNIQUE (company_id, number)`.
* Um rollback (item inválido, desconto além do subtotal, qualquer falha)
  desfaz a alocação junto — o número nunca é "queimado" por uma tentativa
  que falhou (`C22`/`N3`).

### Máquina de status

* `ServiceOrderStatus`: `open` → `in_progress` → `completed`/`cancelled`.
  Sem `draft` server-side — o wizard do frontend mantém rascunho
  inteiramente local (state/localStorage); a O.S. só nasce no servidor no
  submit final, sempre como `open`. Isso evita registros parciais
  abandonados no banco.
* `complete` aceita tanto `open → completed` quanto `in_progress →
  completed` — o usuário não é obrigado a clicar "Iniciar" antes de poder
  concluir um atendimento simples.
* `cancel` exige `reason` (obrigatório, trim, até 1000 caracteres),
  persiste `cancellation_reason` + `cancelled_at`.
* `completed`/`cancelled` são terminais: nenhuma ação de status, nenhuma
  edição de header, nenhuma mutação de item é permitida depois —
  `App\ServiceOrders\Exceptions\ServiceOrderStatusConflictException`
  renderiza 409 automaticamente (Laravel chama `render()` da própria
  exceção).
* Sem `DELETE /service-orders/{id}` — o "apagar" de negócio é `cancelled`.

### Dinheiro exato — bcmath, nunca float

* `ext-bcmath` foi habilitado no container PHP
  (`infrastructure/docker/api/Dockerfile`) e declarado em
  `composer.json` (`require.ext-bcmath`) especificamente para este gate —
  não existia nenhuma dependência de matemática decimal em `apps/api`
  antes disso.
* `App\ServiceOrders\Money` é a única classe que faz aritmética monetária:
  `add`/`subtract`/`multiply`/`compare`/`normalize`/`round`, todas
  operando em strings decimais, nunca `float`. `round()` implementa
  arredondamento **half-up** explícito (bcmath só trunca, nunca arredonda):
  soma meia unidade na última casa decimal mantida, depois trunca — testado
  diretamente (`F11`: `round("2.345", 2) === "2.35"`, `round("1.005", 2)
  === "1.01"`) e por ausência de drift em 1000 somas de `0.10` (`F12`).
* `App\ServiceOrders\ServiceOrderCalculator` centraliza as fórmulas:
  `gross_line = round(quantity × unit_price, 2)`;
  `line_total = gross_line - line_discount`;
  `subtotal = SUM(line_total)`;
  `total = subtotal - order_discount + travel_fee`.
* Servidor é a única autoridade sobre `subtotal`/`total`/`line_total` — o
  frontend nunca os envia (`prohibited`); recalculados a cada
  criação/edição de item e a cada alteração de `order_discount`/
  `travel_fee` no header, sempre na mesma transação da mutação.

### Deslocamento (travel_fee) e configuração por empresa

* `service_order_settings` guarda `default_travel_fee` por empresa
  (`company_id` único). `GET /service-orders/settings` sem linha
  persistida devolve `"0.00"` sem gravar nada — só grava no `PUT`.
* Ao criar uma O.S. sem `travel_fee` no payload, o valor atual do default
  da empresa é copiado para a O.S. (`S7`). Uma vez copiado, é só um valor
  daquela O.S.: mudar o default depois não altera O.S. já criadas (`S8`/
  `F16`), e mudar o `travel_fee` de uma O.S. específica não altera o
  default da empresa (`F15`).
* `travel_fee` pode existir mesmo em uma O.S. sem nenhum item
  (`subtotal=0.00`) — uma visita/deslocamento cobrado sem item de
  catálogo ainda lançado é um caso operacional real (`F7`).
* `order_discount` é sempre `<= subtotal`; com `subtotal=0` o desconto só
  pode ser `0.00` (`F8`).

### Tenant e roteamento

* `ServiceOrder`/`ServiceOrderItem` usam `BelongsToCompany`, igual a todo
  domínio existente — `company_id` nunca vem do request.
* `{serviceOrder}`/`{item}` nunca são route-model binding implícito, pela
  mesma razão já documentada em `CustomerController`/`CatalogItemController`:
  `SubstituteBindings` roda antes de `resolve-current-company`. Toda
  resolução é explícita dentro da action (`ServiceOrder::query()->
  findOrFail($id)`, `$order->items()->findOrFail($item)`), o que torna um
  id cross-tenant um 404 estrutural, nunca um 403 revelador.
* IDs cross-tenant referenciados em `create`/`update` (`customer_id`,
  `customer_address_id`, `customer_contact_id`, `catalog_item_id`,
  `responsible_user_id`) são um 422 genérico e indistinguível de "esse id
  não existe" — a checagem de posse roda em `Http\Requests\Concerns\
  ValidatesServiceOrderRelations`, reaproveitada por `Store`/
  `UpdateServiceOrderRequest`, usando as queries já tenant-escopadas de
  `Customer`/`CustomerAddress`/`CustomerContact` (`CompanyScope` via
  `BelongsToCompany`) e uma checagem direta em `company_user` para
  `responsible_user_id`.
* Rotas de settings (`/service-orders/settings`) são registradas **antes**
  de `/service-orders/{serviceOrder}` em `routes/api.php`, para que
  "settings" nunca seja interpretado como um id de O.S.

### Item é sempre um snapshot de CatalogItem

* Adicionar um item exige `catalog_item_id` de um `CatalogItem`
  `active=true` do tenant atual — item inativo ou de outro tenant é 422.
* `unit_price`: se enviado (mesmo `"0.00"`), vale o valor enviado; se
  omitido/`null`, cai para `CatalogItem.sale_price`; se os dois forem
  nulos, 422 ("Informe o preço unitário."). O preço da linha é
  independente do preço futuro do catálogo — provado em `H9`.
* `PUT` de um item só altera `quantity`/`unit_price`/`line_discount`/
  `notes`/`sort_order` — `catalog_item_id`/`type`/`code`/`name`/`unit`/
  `description` são o snapshot da inserção e nunca são reescritos por essa
  rota. Trocar de item significa remover a linha e adicionar outra.

## Contrato para FRONTEND-OS-01 (futuro)

* **Criação rápida usa os endpoints canônicos existentes, sempre.** O
  botão "+ Novo cliente" na O.S. chama `POST /api/v1/customers` (nunca
  uma tabela paralela tipo `service-order-customers`/`quick-customer`);
  "+ Novo endereço" chama `POST /api/v1/customers/{customer}/addresses`;
  "+ Novo contato" chama `POST /api/v1/customers/{customer}/contacts`;
  "+ Novo produto"/"+ Novo serviço" chamam `POST /api/v1/catalog-items`.
  Depois do `201`, a UI simplesmente seleciona a entidade recém-criada.
* Se o usuário criar Customer/Address/Contact/CatalogItem inline e depois
  abandonar a O.S. sem enviar o submit final, esses cadastros
  **permanecem** — são entidades reais e canônicas, não rascunhos
  pertencentes à O.S. (que, nesse ponto, nunca chegou a existir no
  servidor).
* Passo a passo conceitual do wizard (frontend, sem draft server-side):
  1. Cliente; 2. Local e contato; 3. Produtos e serviços; 4. Agendamento e
  resumo. O servidor só recebe a O.S. completa no envio final do passo 4.
* Campos de agendamento (`scheduled_start_at`/`scheduled_end_at`) são
  `timestamptz`, expostos em ISO 8601; quando ambos informados,
  `end >= start` é exigido tanto no `CHECK` do banco quanto na validação
  da aplicação.

## Integração com o motor de notificações — adiada

Este gate é puramente transacional. Nenhuma `NotificationEvent`/
`NotificationDelivery`/job/chamada à Evolution API é disparada por
criar/editar/iniciar/concluir/cancelar uma O.S. — confirmado por teste
(zero linhas em `notification_events`/`notification_deliveries` após um
fluxo completo). A integração real (notificar cliente/responsável em cada
transição de status) é escopo de um gate futuro (BACKEND-06A) — importante:
esse gate futuro não deve chamar provider externo de dentro de uma
transaction (mesma regra já estabelecida para o motor de notificação
existente).

## Consequências

* Primeiro domínio do backend com aritmética monetária composta
  (soma de linhas, desconto, taxa) — `Money`/`ServiceOrderCalculator`
  ficam como o padrão de referência para qualquer cálculo financeiro
  futuro (Orçamento, Financeiro real).
* Primeiro domínio com numeração sequencial por tenant — o padrão
  `service_order_sequences` + `SELECT ... FOR UPDATE` fica disponível para
  qualquer numeração futura (número de Orçamento, de Nota Fiscal, etc.).
* `ServiceOrder`/`ServiceOrderItem` completam o contrato de snapshot já
  previsto na ADR-010 — o mesmo padrão (`catalog_item_id` nullable +
  snapshot completo) deve ser seguido por `BudgetItem` quando Orçamentos
  ganhar backend real.
