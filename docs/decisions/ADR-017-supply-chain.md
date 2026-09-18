# ADR-017: Supply chain (Materials, Suppliers, and the domains that follow)

## Status

Accepted (SUPPLY-API-01A, preceded by the audit-only SUPPLY-API-00).

## Context

ObraFácil needed a real backend for the supply-chain domain (Material,
Supplier, and — in later gates — MaterialRequirement, PurchaseOrder,
GoodsReceipt, MaterialConsumption, StockAdjustment) — until this gate,
every one of these existed only as a frontend-only, localStorage-backed
prototype (`apps/web/src/features/{materials,purchases,stock,suppliers}`).
SUPPLY-API-00 audited that prototype in full (every store, every UX flow,
every consumer in Project Detail/Dashboard/Analytics/Payables) and
recommended the decisions below. This gate (SUPPLY-API-01A) implements
only the first two masters — `Material` and `Supplier` — everything else
is explicitly deferred to later gates in the same sequence.

The Customer, CatalogItem, Budget, and Project domains (ADR-008, ADR-010,
ADR-013, ADR-016) already established the conventions this gate follows:
UUID PKs, `company_id` as a `restrictOnDelete()` tenant column enforced by
`BelongsToCompany`/`CompanyScope`, explicit (never implicit) route-model
resolution after `resolve-current-company`, and a `QueryException`→
`ValidationException` translation service for race-safe unique
constraints. `Material`/`Supplier` reuse all of these patterns rather than
inventing new ones.

## Decisions

1. **`Material` ≠ `CatalogItem` — reaffirming ADR-010, not reopening it.**
   `Material` is the operational domain the Obra consumes (planning,
   purchase, stock, consumption); `CatalogItem` is the commercial domain
   sold to the Customer (Budget/ServiceOrder items). No `catalog_item_id`
   on `materials`, no `material_id` on `catalog_items`, no automatic sync
   between the two. A future composition (a `CatalogItem` of type
   `service` that "consumes" Materials to be executed — a BOM/recipe) is
   deliberately out of scope, exactly as ADR-010 already recorded.

2. **`Material` and `Supplier` are both Company-wide, not Obra-scoped.**
   Neither table has a `project_id` — the same Material or Supplier is
   reused across every Obra of the Company, matching the prototype's own
   design (Material/Supplier have never had a per-Obra concept).

3. **No unit conversion, ever.** A Material has exactly one operational
   unit (`unit_code` + optional `unit_custom_label` when `unit_code =
   'other'`) — "50 kg" never automatically becomes "1 saco". This is a
   permanent product decision (SUPPLY-API-00 §6/§10), not a v1 gap to be
   filled later: no `conversion_factor`, no `base_unit`/`secondary_unit`,
   no package-quantity field will ever be added to this table.

4. **Material unit immutability is a *widening* invariant, tracked here
   even though most of its dependencies don't exist yet.** The prototype
   this gate formalizes only locks `defaultUnit` once a Material has a
   `MaterialRequirement` or `PurchaseOrderItem` — SUPPLY-API-00 §7/§11
   identified this as an *incomplete* rule: `MaterialConsumption` and
   `StockAdjustment` don't snapshot their own unit (unlike
   `PurchaseOrderItem`, which does), so once those tables exist, changing
   a Material's unit out from under existing consumption/adjustment
   history would silently corrupt what those historical quantities
   *mean*. The **definitive** rule, to be fully enforced once every
   dependency exists:

   > `materials.unit_code`/`unit_custom_label` may change only while the
   > Material has **zero** rows across `material_requirements`,
   > `purchase_order_items`, `material_consumptions`, and
   > `stock_adjustments`.

   `GoodsReceipt`/`GoodsReceiptItem` need no guard of their own — a
   `GoodsReceiptItem` can only exist against a `PurchaseOrderItem`, which
   is already covered. `MaterialService` is structured (a single
   `assertUnitChangeable()`-shaped seam, see Consequences) so each later
   gate (SUPPLY-API-01B/01C/01E) adds its own dependency check to the same
   place, never a parallel, drifting copy of the rule.

5. **Material delete is dependency-guarded, not soft.** No `deleted_at`.
   `active = false` is the normal "removal" path (mirrors
   `CatalogItem.active`). A hard `DELETE` is permitted **only** when the
   Material has zero rows in `material_requirements`,
   `purchase_order_items`, `material_consumptions`, and
   `stock_adjustments` — the exact same four-table check as decision #4,
   deliberately unified into one guard rather than two similarly-shaped
   but independently-drifting rules. In this gate, none of those four
   tables exist yet, so every Material created here can currently be
   hard-deleted without restriction — the guard is structural
   (`MaterialService::delete()` is the one seam every later gate extends),
   not yet exercised by any real dependency.

6. **Supplier document accepts CPF or CNPJ, no `kind` field.** The
   prototype's UI already reads "CNPJ/CPF (opcional)" — this gate
   preserves that product contract rather than forcing a Customer-style
   `kind` distinction Supplier has never had. `document` is nullable;
   when present, canonicalized to digits-only and dispatched by length:
   11 digits → validated as CPF, 14 digits → validated as CNPJ, any other
   length → `422`. A new `App\Rules\CpfOrCnpj` composes the existing
   `App\Support\Document::isValidCpf()`/`isValidCnpj()` — no duplicate
   checksum logic.

7. **Supplier phone is E.164, address stays a single string.** Phone
   reuses `App\Rules\E164Phone` unchanged (same contract as Customer) —
   the masked BR input the prototype types today is a frontend-only
   presentation concern, never persisted. Address stays exactly the
   single free-text string the prototype already has — SUPPLY-API-00 §17
   found no product evidence (no delivery-routing screen, no CEP lookup
   for Supplier anywhere) that justifies a structured `SupplierAddress`
   the way `CustomerAddress` exists. Revisit only if a real logistics
   requirement surfaces.

8. **Supplier delete is dependency-guarded on `PurchaseOrder`, any
   status.** No `deleted_at`. `active = false` is the normal removal
   path. A hard `DELETE` is permitted only while the Supplier has zero
   `purchase_orders` rows — **including `cancelled`** ones, preserving
   commercial history even for a cancelled order. That table doesn't
   exist yet in this gate, so delete is currently unrestricted (structural
   guard, exercised starting SUPPLY-API-01C).

9. **Stock will never be a mutable column.** Reaffirmed from
   SUPPLY-API-00 §14/§39: no `stock_quantity` field will ever exist on any
   table. A Project+Material balance is, and will remain, derived purely
   from the sum of physical events (`GoodsReceiptItem` +, `Material
   Consumption` -, `StockAdjustment` ± by type) computed at read time —
   never a duplicated, independently-drifting formula. `StockMovement` is
   a read-only computed view over those same three sources, never its own
   persisted ledger table, and there is no central/administrative
   warehouse — every unit of stock belongs to exactly one Obra.

10. **Purchase is a three-layer boundary, and the boundary stays
    manual.** A commercial fact (`PurchaseOrder`) is not a physical fact
    (`GoodsReceipt`) is not a financial obligation (`Payable`) is not a
    realized cost (`ProjectCost`). Creating or confirming a PurchaseOrder
    never creates a Payable; receiving goods never creates a Payable or a
    ProjectCost. The only bridge from Purchase into Financeiro remains the
    existing, deliberate manual action ("Gerar conta a pagar") the
    prototype already has — this gate does not touch Financeiro at all,
    and no future gate should make that bridge automatic without a fresh,
    explicit product decision.

11. **`PurchaseOrder`'s future human number is `PC-000001`.** Sequential
    per Company, server-generated, allocated via the same row-locked
    `SELECT ... FOR UPDATE` + `xxx_sequences` pattern already proven three
    times (`BudgetNumberAllocator`/`ServiceOrderNumberAllocator`/
    `ProjectNumberAllocator`). Not created in this gate — recorded here so
    SUPPLY-API-01C starts from a closed decision instead of re-litigating
    naming.

12. **`PurchaseOrder` DELETE will exist only for `draft`.** Correcting
    SUPPLY-API-00's own audit, which under-specified this: the prototype
    already implements `removePurchaseOrder` for `draft` orders only
    (cascading their own, never-yet-committed items) — `ordered` and
    `cancelled` orders have no DELETE path; cancellation (a status
    transition) is the only "removal" once an order has ever been
    confirmed. Not implemented in this gate — recorded for SUPPLY-API-01C.

13. **`StockAdjustment` will be append-only.** No update, no delete —
    correcting a manual adjustment means recording a new, opposite
    adjustment, never editing or removing the original. This mirrors
    (and is stricter than) `MaterialConsumption`'s own "delete and
    re-register" convention. Not implemented in this gate — recorded for
    SUPPLY-API-01E.

## Consequences

- `MaterialService`/`SupplierService` centralize `create`/`update`/
  `delete` so later gates add dependency guards in exactly one place per
  entity, never duplicated across a Controller and a Service the way the
  prototype's own `Supplier` delete guard currently drifted (two
  divergent implementations, only one actually wired to the UI —
  SUPPLY-API-00 §18 finding).
- Every future domain that needs "which Material"/"which Supplier"
  (MaterialRequirement, PurchaseOrder, PurchaseOrderItem,
  MaterialConsumption, StockAdjustment) depends on a real, tenant-scoped
  UUID FK from day one — never an unvalidated localStorage string.
- Because delete is dependency-guarded rather than soft, a Company
  accumulates only genuinely-still-free Material/Supplier rows once real
  dependents exist; this is an accepted, explicitly-tracked limitation of
  the guard's own structure, not an oversight.
- Reusing `App\Support\Document`/`App\Rules\{Cpf,Cnpj,E164Phone}`/the
  `QueryException`→`ValidationException` race-safe-unique pattern verbatim
  means Supplier's document/phone guarantees are proven by the same,
  already-battle-tested mechanisms Customer already uses — no new
  validation infrastructure was invented for this gate.

- **Update (SUPPLY-API-01B)**: `MaterialRequirement` now exists and is the
  first real dependent wired into `MaterialService::hasDependents()` — the
  unit-change guard (`update()`) and the delete guard (`delete()`) both
  call it, exactly as anticipated above. `SupplierService::hasPurchaseOrders()`
  remains unwired (still always `false`) because `purchase_orders` doesn't
  exist yet — SUPPLY-API-01C must both implement it for real and make
  `SupplierService::delete()` call it, the same seam-wiring this gate did
  for Material.
- **Update (SUPPLY-API-01B1)**: `MaterialRequirementService` now
  revalidates both Project and Material under the active
  CompanyScope/CurrentCompanyContext on every public method, independent
  of what the caller passed in.
- **Update (SUPPLY-API-01C)**: `PurchaseOrder`/`PurchaseOrderItem` now
  exist. `PC-000001` numbering is allocator-based (`PurchaseOrderNumberAllocator`,
  same row-locked-sequence pattern as Project/Budget/ServiceOrder). Status
  actions (confirm/cancel/return-to-draft) are the only path
  `commercial_status` changes; `cancelled -> ordered` is impossible by
  construction. Hard DELETE stays draft-only, matching the future
  PurchaseOrder decision recorded above. `PurchaseOrderItem` snapshots
  `unit_code`/`unit_custom_label` from the Material at creation and is now
  the SECOND real dependent wired into `MaterialService::hasDependents()`
  (OR'd with `MaterialRequirement`). `PurchaseOrder` is Supplier's FIRST
  real dependent — `SupplierService::hasPurchaseOrders()`/`delete()` are
  wired for real. `MaterialService`/`SupplierService`/the new Purchase
  Services all re-resolve their Model arguments under CompanyScope
  (DOMAIN-SERVICE-TENANT-DEFENSE-01, closed for these three) and take a
  real `lockForUpdate()` row lock around every dependency-lifecycle
  create/delete pair (Material vs MaterialRequirement/PurchaseOrderItem;
  Supplier vs PurchaseOrder), so the two sides serialize instead of
  racing a plain SELECT-then-write. `GoodsReceipt` real guards on
  PurchaseOrderItem, and any Payable-linked guard once Payables are a
  real backend, both remain deferred exactly as anticipated below.
- **Update (SUPPLY-API-01C1)**: Material unit mutation now serializes by
  the Material row (`MaterialService::update()` shares the same
  `lockForUpdate()` as `delete()`/the dependent creators); draft Supplier
  reassignment serializes with the target Supplier's own lifecycle
  (`PurchaseOrderService::updateHeader()` locks the target Supplier
  before writing the new FK); PurchaseOrder's optimistic version
  (`updated_at`) now uses a monotonic timestamp
  (`PurchaseOrderVersionClock`, microsecond-precision columns) so two
  mutations can never share an indistinguishable version.

## Deferred to later gates

- `MaterialRequirement` (SUPPLY-API-01B) — DONE.
- `PurchaseOrder`/`PurchaseOrderItem`, including the `PC-000001` number
  allocator and the draft-only DELETE (SUPPLY-API-01C) — DONE.
- `GoodsReceipt`/`GoodsReceiptItem`, including the over-receipt
  concurrency guard (SUPPLY-API-01D).
- `MaterialConsumption`/`StockAdjustment`/the Stock read model
  (SUPPLY-API-01E).
- Any Purchase→Payable automation (explicitly out of scope indefinitely
  unless a fresh product decision authorizes it).
- Frontend migration of Materials/Suppliers (`SUPPLY-FRONTEND-01A`) — the
  existing prototype stores/screens are untouched by this gate.
