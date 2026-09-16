# ADR-016: Projects (Obras) domain

## Status

Accepted (PROJECT-API-01, preceded by the audit-only PROJECT-API-00).

## Context

ObraFácil needed a real backend for "Obras" (construction projects) — until
this gate, `Project` existed only as a frontend-only, localStorage-backed
prototype (`apps/web/src/features/projects/prototype/`). PROJECT-API-00
audited that prototype and every domain that references it (Dashboard,
Clientes, Materiais, Estoque, Compras, Custos da obra, Equipe, Contas a
pagar/receber, Orçamentos) before any backend code was written, and
recommended the decisions below. The Customer, CustomerAddress, Budget, and
ServiceOrder domains (ADR-008, ADR-011, ADR-013) already established the
conventions this gate follows: UUID PKs, `company_id` as a
`restrictOnDelete()` tenant column enforced by `BelongsToCompany`/
`CompanyScope`, row-locked per-company sequence allocation
(`BudgetNumberAllocator`/`ServiceOrderNumberAllocator`), and a parent-row
`FOR UPDATE` lock serializing every mutation. Project reuses all of these
patterns.

## Decisions

1. **Project is an operational hub, not a historical document.** Unlike
   Budget's `customer_name`/`company_snapshot` (frozen at the moment a
   proposal is sent to a customer, deliberately never resynced), Project's
   `customer()` relation is LIVE — `Project` stores only `customer_id`, and
   `ProjectResource` always reflects the Customer's current name. Renaming
   a Customer is immediately visible on every Project referencing it. This
   is a deliberate asymmetry with Budget/ServiceOrder: those freeze a
   commercial snapshot at a decision point; Project has no such decision
   point to freeze against — it's a living record that outlives the moment
   it was created.

2. **The Obra's own address is a flat, structured, mutable snapshot** —
   `address_postal_code`/`address_street`/.../`address_reference_point` on
   the `projects` table itself, named `address_*` (not `execution_*` —
   that prefix on ServiceOrder means "where the service was executed";
   here it's the Obra's own physical location). `customer_address_id` is
   only an optional ORIGIN reference (`nullOnDelete()`), never the source
   of truth once copied: editing or deleting the live `CustomerAddress`
   never mutates a Project's already-stored address. An explicit `address`
   in the request always wins over a fresh copy from `customer_address_id`
   in the same request. This lets a user start from a Customer's address
   and then correct site-specific details (a gate code, a different unit),
   or type a manual address with no CustomerAddress at all, or have no
   address yet.

3. **`source_budget_id` is a unilateral, immutable-after-create
   reference.** Budget gets NO relation back to Project — no `project_id`
   column, no `project()`/`projects()` method, ever (enforced by
   `ProjectStructuralTest`, which also re-asserts `StoreBudgetRequest`/
   `UpdateBudgetRequest` still prohibit `project_id`, exactly as ADR-011/
   ADR-013 already established for ServiceOrder/Budget). Only an
   `approved` Budget belonging to the same Company AND the same Customer
   as the Project may be used as `source_budget_id`, and only at creation
   time — `UpdateProjectRequest` prohibits it outright. This records "this
   Obra originated from this Budget" without reintroducing the
   bidirectional coupling the product deliberately removed from Budget.

4. **No delete semantics in v1.** No `deleted_at`, no DELETE route.
   Project is already a hub other domains depend on by ID (Materiais,
   Estoque, Compras, Custos da obra, Equipe, Contas a pagar/receber all
   store a `projectId` foreign key in their own prototype records, per the
   PROJECT-API-00 audit) — a hard delete would orphan them, and no product
   requirement justifies the complexity of a guarded soft delete yet.
   Retention/soft-delete is deferred to a future gate if a real need
   surfaces.

5. **Optimistic concurrency via `updated_at`, not a formal state
   machine.** All four `ProjectStatus` values (`planning`/`in_progress`/
   `paused`/`completed`) freely inter-transition via a plain `PUT` — no
   dedicated `/start`/`/complete` endpoints like ServiceOrder, because the
   frontend prototype this gate formalizes has no guards today (any status
   button can be clicked from any state) and no evidence exists that the
   product needs one yet. What IS enforced is a real optimistic-concurrency
   precondition: `PUT` requires the client's last-read `updated_at`;
   `ProjectService::update()` locks the row (`ProjectLocker`, real
   `SELECT ... FOR UPDATE`) and compares the LOCKED row's `updated_at`
   against the client's value — this is what makes the check race-safe
   under genuinely concurrent PostgreSQL connections (proven in
   `ProjectConcurrencyTest`, which drives real separate OS processes via
   `App\Console\Commands\ProjectConcurrencyProbe`, mirroring
   `BudgetConcurrencyProbe`/`ServiceOrderConcurrencyProbe`). A stale
   precondition renders as `409` via
   `ProjectConcurrencyConflictException`.

6. **`ProjectListResource`/`ProjectResource` never embed other domains'
   data.** No cost summaries, team, materials, stock, purchases, payables,
   or receivables arrays — even though the current frontend prototype's
   single Obra detail screen aggregates all of these. Each of those stays
   a separate future API scoped by `project_id`; Project's own Resources
   expose only its own fields, a live Customer summary, its own address,
   and (optionally) a lean `source_budget` summary (`{id, number, total}`
   — never items/cost/margin).

7. **Human-facing number is `OBR-000001`, sequential per Company,
   server-generated.** Mirrors `BudgetNumberAllocator`/
   `ServiceOrderNumberAllocator` exactly: a `project_sequences` table with
   `company_id` as its own primary key, allocated via
   `SELECT ... FOR UPDATE` inside the creating transaction so a rolled-back
   create never burns a number. Proven race-safe under real concurrent
   PostgreSQL connections in `ProjectConcurrencyTest::
   test_number_concurrency_distinct_sequential_numbers`.

8. **Legacy frontend data is never auto-imported.** The prototype's
   `obrafacil:projects`/`obrafacil:projects:deleted` localStorage keys and
   `mocks/projects.ts` seed are not migrated into PostgreSQL by this gate
   — same strategy already used for Budget. A future `FRONTEND-PROJECTS-01`
   gate will point the frontend at this API; the prototype store keeps
   working, untouched, until then.

## Consequences

- Every future domain that needs "which Obra" (Materiais, Estoque,
  Compras, Custos da obra, Equipe, Contas a pagar/receber) can now depend
  on a real `project_id` foreign key with tenant-safe `CompanyScope`
  ownership, instead of an unvalidated localStorage string.
- A Customer rename is reflected everywhere a Project references that
  Customer — there is no "stale name" class of bug for Project the way
  there deliberately is for a frozen Budget proposal.
- Because Project has no formal state machine yet, any product requirement
  for guarded transitions (e.g., "can't go back to planning once
  completed") is a new, explicit gate — not something silently
  retrofitted here.
- Because there's no DELETE yet, a Company accumulates Projects
  indefinitely in v1; this is an accepted, explicitly-deferred limitation,
  not an oversight.
