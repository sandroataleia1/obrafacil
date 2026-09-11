# ADR-010: Catálogo comercial (Produtos e Serviços)

## Status

Aceito

## Contexto

Orçamentos, Ordens de Serviço e propostas comerciais futuras precisam de
uma fonte canônica de "o que a empresa vende" — produto (bem entregue ao
cliente) ou serviço (mão de obra/atividade comercial), com preço de venda
sugerido. Hoje o único conceito próximo que existe é `Material`
(estoque/compra/consumo/fornecedor), e ele vive **apenas no protótipo
frontend** (`apps/web/src/features/materials`) — não há nenhum backend
Material, Stock, Purchase, Supplier ou ProjectMaterialRequirement em
`apps/api` (confirmado por auditoria completa de `app/Models/` antes desta
rodada).

## Decisão

* **`CatalogItem` ≠ `Material`, por design, não por acaso.** `Material`
  representa o que a obra *consome* (saco de cimento CP-II 50kg, saldo de
  estoque, fornecedor, necessidade da obra). `CatalogItem` representa o que
  a empresa *vende* comercialmente (execução de alvenaria por m²,
  fornecimento e instalação de porta de madeira). Um `CatalogItem` de tipo
  `service` frequentemente *consome* materiais para ser executado, mas essa
  composição (BOM/receita) é um problema futuro, deliberadamente fora
  deste gate — `CatalogItem` não importa, referencia, ou é importado por
  nenhuma entidade de Material/Stock/Purchase. Nenhum `material_id`.
* **`type` (`product`/`service`)**: enum PHP `CatalogItemType`, coluna
  string — mesmo padrão de `CustomerKind`/`NotificationEventType`. Reforçado
  por um `CHECK` no Postgres (`catalog_items_type_check`), mesmo estilo de
  `customers_document_format_check` — a aplicação continua sendo a
  autoridade primária (`Rule::enum` no FormRequest), o `CHECK` é o
  backstop.
* **Sem regras de preço/unidade diferentes entre `product` e `service`** —
  a distinção é puramente semântica para quem lista/filtra o catálogo.
* **`code` opcional, único por tenant, case-insensitive**: índice único
  *parcial* e *funcional* —
  `CREATE UNIQUE INDEX catalog_items_company_code_unique ON catalog_items
  (company_id, LOWER(code)) WHERE code IS NOT NULL`. Parcial porque um
  `code` nulo nunca compete por unicidade; funcional (`LOWER(code)`) porque
  `SRV-001` e `srv-001` devem conflitar. Diferente do índice de
  `customers_company_document_unique`, este **não** exclui itens
  `active=false` — um código de item inativo continua reservado
  deliberadamente (o código pertence ao histórico do catálogo, não é
  liberado por inativação).
* **Não há coluna `deleted_at`** — ao contrário de `Customer`, este gate
  não tem soft delete algum. `active=false` é a única forma de "remoção"
  (§17/§18); não existe rota `DELETE`. Isso é intencional e definitivo
  para este domínio: um `CatalogItem` será referenciado historicamente por
  `BudgetItem`/`ServiceOrderItem` (ver seção "Contrato de snapshot futuro"
  abaixo), então a linha nunca pode desaparecer fisicamente.
* **Corrida de `code` real, não apenas pré-check**: `CatalogItemService`
  verifica `$e->getCode() === '23505'` **e** que a mensagem contenha
  literalmente `catalog_items_company_code_unique` antes de converter em
  `ValidationException` no campo `code` — qualquer outro `QueryException`
  (violação de FK, `CHECK` de preço, erro de conexão, etc.) propaga sem
  alteração. Mesmo padrão de `CustomerService::rethrowAsValidationIfDocumentConflict()`,
  incluindo o `DB::transaction()` aninhado em `update()` para criar um
  `SAVEPOINT` real e não envenenar a transação externa (de request/teste)
  quando a violação é capturada.
* **Dinheiro como decimal, nunca float binário**: `cost_price`/`sale_price`
  são `decimal(14,2)` no Postgres, com `CHECK (... IS NULL OR ... >= 0)`
  cada um. O cast do model é `decimal:2` — o Eloquent devolve **string**
  (`"18.50"`, `"0.00"`), nunca float, e o `CatalogItemResource` expõe esse
  valor diretamente, sem cast adicional. Esta é a primeira coluna decimal
  de todo o `apps/api`; o padrão fica registrado aqui para qualquer
  domínio monetário futuro.
* **Nenhuma margem imposta**: `sale_price < cost_price` é permitido
  deliberadamente (promoção, custo provisório, venda abaixo do custo por
  decisão comercial da empresa) — não há validação cruzada entre os dois
  campos.
* **`active` filtra por omissão para "ambos"**, nunca "somente ativos"
  por padrão — a tela administrativa do catálogo precisa enxergar itens
  inativos para poder reativá-los. `active=true`/`active=false` filtram
  explicitamente. Seletores operacionais futuros (Orçamento, OS) é que
  vão, no lado de quem consome, preferir `active=true` — isso não é
  reforçado aqui.
* **`{catalogItem}` nunca é route-model binding implícito**, mesma razão
  arquitetural documentada em `CustomerController`: `SubstituteBindings`
  roda antes de `resolve-current-company` na prioridade de middleware
  atual do projeto. Toda resolução é `CatalogItem::query()->findOrFail($id)`
  explícita, dentro da action, após o tenant já estar resolvido — o que
  também torna um id cross-tenant um 404 estrutural (o `CompanyScope`
  simplesmente não encontra a linha), nunca um 403 revelador.
* **Nenhum evento de notificação**: CRUD de `CatalogItem` não dispara
  `NotificationEvent`/`NotificationDelivery`/job/WhatsApp — cadastrar um
  produto ou serviço no catálogo não é um evento operacional da obra.

## Contrato de snapshot futuro (BudgetItem / ServiceOrderItem)

Quando um `CatalogItem` for selecionado em um Orçamento ou em uma Ordem de
Serviço, o item de negócio resultante **não pode depender** do estado
futuro do catálogo. `BudgetItem`/`ServiceOrderItem` (ainda não
implementados) deverão copiar, no momento da seleção, um *snapshot*
contendo pelo menos:

```
catalog_item_id   (nullable — referência histórica, não FK obrigatória)
type
code
name
unit
description
unit_price          (preço praticado naquele documento, editável ali)
```

Se o `CatalogItem` de origem depois mudar de nome, mudar de preço, ou for
inativado, os documentos comerciais já emitidos **não mudam**. O preço do
catálogo (`sale_price`) é sempre uma *sugestão* no momento da seleção —
nunca o valor histórico de verdade. Um item `active=false` deixa de
aparecer para *nova* seleção em Orçamento/OS, mas nunca invalida um
documento que já o referenciava.

## Contrato para FRONTEND-CATALOG-01

Tela futura "Produtos e Serviços": busca; filtro Todos/Produtos/Serviços;
filtro de status Ativos/Inativos/Todos; "Novo item" com os campos Tipo,
Código, Nome, Categoria, Unidade, Descrição, Custo base, Preço de venda,
Ativo. Nenhuma dessas telas foi implementada nesta rodada (§56: zero
mudança em `apps/web`).

## Consequências

* `CatalogItem` é um domínio novo e completamente isolado — zero
  acoplamento com Material/Stock/Purchase/Supplier, que continuam apenas
  no protótipo frontend.
* A primeira coluna monetária do backend estabelece o padrão
  `decimal(N,2)` + cast `decimal:2` + `CHECK >= 0` + string na API, a ser
  seguido por qualquer domínio futuro que envolva dinheiro (Orçamento, OS,
  Financeiro real).
* Sem `DELETE`/soft delete, o histórico de qualquer documento comercial
  futuro que referencie um `CatalogItem` é estruturalmente protegido desde
  já, mesmo antes de `BudgetItem`/`ServiceOrderItem` existirem.
