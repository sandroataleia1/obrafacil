# ADR-013: Budget/Proposal domain

## Status

Accepted (BUDGET-API-01).

## Context

ObraFácil needed a commercial quoting flow: an internal user assembles a
Budget (a quote) for a Customer from catalog items, calculator results, and
manual entries, submits it, and the customer decides — either via an
internal (manual) decision or via a public, unauthenticated link. This is
the first domain in the backend that exposes an unauthenticated, public
HTTP surface.

The Customer, CatalogItem, and ServiceOrder domains (ADR-008, ADR-010,
ADR-011) already established the conventions this gate follows: UUID PKs,
`company_id` as a `restrictOnDelete()` tenant column enforced by
`BelongsToCompany`/`CompanyScope`, decimal-string money via bcmath
(`App\ServiceOrders\Money`), row-locked per-company sequence allocation
(`ServiceOrderNumberAllocator`), and a parent-row `FOR UPDATE` lock
(`ServiceOrderLocker`) serializing every mutation. Budget reuses all of
these patterns rather than inventing new ones.

## Decisions

1. **No Project coupling.** Like ServiceOrder, a Budget has no
   `project_id` column, no relation, and no code reference to
   `App\Models\Project`. A Budget is a quote for a Customer, independent
   of any Obra — this gate deliberately does not wire budgets into a
   project/obra creation flow.

2. **Money is bcmath decimal strings, never float.** `App\Budgets\Money`
   does not reimplement decimal arithmetic — it delegates every method to
   `App\ServiceOrders\Money` (round-half-up, bcmath-backed). This keeps
   exactly one canonical rounding rule in the codebase instead of two
   copies that could silently drift. `App\Budgets\BudgetCalculator` is the
   single place every Budget money formula lives (mirrors
   `ServiceOrderCalculator::grossLine()`/`lineTotal()` exactly):
   - `gross_sale = round(quantity × unit_price, 2)`
   - `line_total = gross_sale - line_discount` — `line_discount` defaults
     to `0.00` when omitted, is never negative (FormRequest `min:0` +
     database CHECK), and is rejected with a 422 if it exceeds the
     line's own `gross_sale` (`BudgetItemService::assertDiscountWithinGrossSale()`
     — spec §61 doesn't list an explicit per-line CHECK capping it, but
     `line_total >= 0` already is one, so an over-large discount is
     rejected outright rather than silently clamped, same discipline as
     `ServiceOrderItemService::assertDiscountWithinGross()`).
   - `line_cost_total = round(quantity × unit_cost, 2)`, or `NULL` when
     `unit_cost` is `NULL` — note `line_cost_total` is never reduced by
     `line_discount`; the discount only applies to the sale side.
   - `subtotal = SUM(line_total)`
   - `cost_subtotal = SUM(line_cost_total)`, or `NULL` the instant ANY
     item has a `NULL` `line_cost_total` — never silently treated as `0`
   - `margin_amount = subtotal - cost_subtotal`, or `NULL` when
     `cost_subtotal` is `NULL`. **Deliberately allowed to be negative** —
     selling below cost is valid business behavior, so there is no
     database CHECK and no application validation rejecting it.
   - `margin_percentage = margin_amount / cost_subtotal × 100`, rounded
     to 4 decimal places, `NULL` when `margin_amount` (equivalently
     `cost_subtotal`) is `NULL`, or when `cost_subtotal` is `0`. **100%
     server-derived** — it is never a field accepted from request input
     anywhere (create, update, item create/update); every FormRequest
     explicitly marks it `prohibited`.
   - `total = subtotal - discount_amount`

3. **Status lifecycle.** `draft` → `pending_approval` → `approved` |
   `rejected`. Only `draft` is mutable (header + items) — the moment a
   Budget is submitted, both the header and every item become read-only,
   enforced by `BudgetStatusConflictException` (409) inside
   `BudgetService`/`BudgetItemService`, never merely at the UI layer.
   `approved`/`rejected` are terminal; there is no un-reject/un-approve
   action in this gate.

4. **Number allocation.** `App\Budgets\BudgetNumberAllocator` mirrors
   `ServiceOrderNumberAllocator` exactly: a row-locked
   `SELECT ... FOR UPDATE` against a per-company `budget_sequences` row,
   with the first-ever allocation's INSERT wrapped in its own nested
   transaction (a real Postgres SAVEPOINT) to survive a concurrent
   first-allocation race. Always called from inside the creating
   transaction, so a later failure (an invalid item, etc.) rolls back the
   allocation too — a failed create never burns a number.

5. **Locking.** `App\Budgets\BudgetLocker` mirrors `ServiceOrderLocker`:
   every mutating method (header update, item add/update/delete, submit,
   manual approve/reject) locks the parent Budget row
   (`SELECT ... FOR UPDATE`) as its very first statement, inside its own
   `DB::transaction()`. This is what serializes concurrent operations on
   the same Budget into a deterministic winner/loser instead of a lost
   update — verified with genuine multi-process PostgreSQL concurrency
   tests (`BudgetConcurrencyTest`, driven by the
   `App\Console\Commands\BudgetConcurrencyProbe` test harness, mirroring
   `ServiceOrderConcurrencyProbe`), covering: (a) two concurrent
   `create()` calls for the same Company never collide on `number`; (b) an
   item mutation racing `submit()` never corrupts the frozen proposal —
   whichever wins the lock commits, the loser gets a clean 409; (c) a
   public approve racing a manual reject resolves to exactly one decision,
   the other observing the post-lock terminal status and 409ing, never
   silently overwritten.

6. **Item sources.** `BudgetItemSourceType`: `catalog` (resolved and
   snapshotted from a `CatalogItem` — `type` (`product`/`service`),
   `name`/`unit`/`code`/`description` are all copied at insertion time
   and never re-derived from the live, possibly later-changed CatalogItem
   row, same discipline as ServiceOrderItem; `catalog_item_id` is
   immutable after creation), `calculator` (a frontend quantity-calculator
   result submitted as already-computed values, identified by the
   required `calculator_type` — exactly one of `masonry`/`floor`/
   `ceiling`/`slab`, backed by a Postgres CHECK constraint — and
   optionally carrying a `calculation_snapshot` JSON snapshot of the
   calculator's inputs for audit, never re-validated or re-derived
   server-side in this gate), and `manual` (fully hand-entered). `type`
   is `NULL` for `calculator`/`manual` items; `calculator_type` is
   `NULL`/prohibited for `catalog`/`manual` items. Both `type` and
   `calculator_type`, like `catalog_item_id`, are creation-time-only
   snapshot fields — never accepted or changed on item update.
   `unit_price` resolution for `catalog` items follows ServiceOrderItem's
   precedent: an explicit value in the payload wins; omitted/`null` falls
   back to the CatalogItem's `sale_price` (missing with no override is a
   validation error). `unit_cost` is different (spec §20): for a
   `catalog` item it is **never** client-supplied — the FormRequest
   rejects it outright (`prohibited_if:source_type,catalog`) and
   `BudgetItemService::resolveFromCatalog()` unconditionally mirrors
   `CatalogItem.cost_price` server-side, even if a caller somehow bypassed
   the FormRequest layer. A missing `cost_price` on the CatalogItem simply
   leaves `unit_cost` `NULL`, which is what triggers rule #2's
   cost_subtotal/margin nulling. `calculator`/`manual` items may set
   `unit_cost` explicitly (or omit it, leaving it `NULL`). `line_discount`
   is accepted for all three source types alike (spec §39-41's payload
   examples show it on catalog/calculator/manual), defaults to `0.00`,
   and feeds `line_total` per rule #2 — it is never itself a
   snapshot/immutable field; it stays editable via item update just like
   `quantity`/`unit_price`/`unit_cost`.

7. **Public proposal access.** `GET /api/v1/proposals/{token}` and
   `POST /api/v1/proposals/{token}/approve|reject` are registered outside
   every authenticated route group — no Sanctum middleware, no
   `resolve-current-company` middleware. `App\Budgets\BudgetProposalResolver`
   is the **one** dedicated place in the entire Budgets domain allowed to
   call `Budget::withoutCompanyScope()` (already exposed generically by
   `BelongsToCompany` for exactly this kind of deliberate, audited
   cross-tenant read) — resolving by the unguessable `proposal_token`
   instead of tenant + id. `BudgetLocker::lockByToken()` is the equivalent
   for the public decision mutations. No other file in the Budgets domain
   bypasses `CompanyScope`. `PublicProposalResource`/
   `PublicProposalItemResource` are separate Resource classes (never the
   authenticated `BudgetResource`/`BudgetItemResource` with fields hidden
   ad hoc) that structurally cannot leak `company_id`, `customer_id`,
   `customer_document`/`phone`/`email`, `unit_cost`, `line_cost_total`,
   `cost_subtotal`, `margin_amount`, `margin_percentage`, internal notes,
   `created_by_user_id`, `decision_by_user_id`, or (at the item level)
   `type`, `calculator_type`, and `calculation_snapshot`.

8. **`proposal_token` generation.** `NULL` while `draft`; generated
   exactly once, on `submit()`, only if still `NULL` (a resubmission
   attempt on an already-submitted Budget is blocked by the status check
   before it would matter). Generated via `Str::random(48)` lower-cased —
   cryptographically strong, unrelated to the Budget's UUID/number/title —
   with a retry loop against a real uniqueness check plus a database
   partial unique index (`WHERE proposal_token IS NOT NULL`) as the
   structural backstop.

9. **`submit()` is deliberately minimal, and `calculation_snapshot` lives
   on `BudgetItem`, not `Budget`.** `submit()` only ever does: require
   `status = draft`, generate `proposal_token` if still `NULL`, set
   `status = pending_approval` and `submitted_at = now()`, save. There is
   **no** Budget-level frozen JSON snapshot of totals/items, and **no**
   minimum-item-count check — a Budget with zero items can be submitted
   (and, later, approved/rejected) just as validly as one with items;
   nothing in the spec requires otherwise. What *is* real is
   `BudgetItem.calculation_snapshot` (JSONB, nullable, item-level) — an
   audit copy of a `calculator`-sourced item's calculator inputs, set
   once at item creation and never touched again. Once a Budget leaves
   `draft`, its items are frozen anyway (rule #3 — every item mutation
   route re-checks `isMutable()` on the freshly-locked parent row), so a
   separate header-level snapshot would have been redundant with that
   guarantee, not an additional safety net.

10. **Decision attribution.** `BudgetDecisionSource`: `manual_internal`
    (an authenticated, tenant-scoped user via `/approve-manually` |
    `/reject-manually` — `decision_by_user_id` always comes from
    `$request->user()`, never the request body) or `public_link` (the
    unauthenticated customer via `/proposals/{token}/approve|reject` —
    attributed by the required `name` field into `decision_by_name`,
    since there is no authenticated identity to record). A decision is
    only accepted while `status = pending_approval`; both decision paths
    share the identical 409-on-non-pending guard, enforced after
    acquiring the row lock in decision #5.

11. **No DELETE route for Budget itself.** Item `DELETE` exists (draft-only,
    same discipline as every other mutation). There is no
    `DELETE /budgets/{id}` route at all in this gate — mirrors
    ServiceOrder's "no hard delete" policy; a Budget's only "removal" is
    reaching a terminal status.

12. **Rate limiting.** The public decision endpoints
    (`/proposals/{token}/approve|reject`) are throttled via Laravel's
    named `RateLimiter` (`proposal-decisions`, registered in
    `AppServiceProvider::boot()`), keyed by `ip + token` at 10/minute —
    high enough that a legitimate customer clicking Approve/Reject (and a
    fumbled duplicate click) is never blocked, low enough to bound
    brute-force decision spam against one proposal from one client. The
    public `GET` (view) endpoint is intentionally not throttled beyond the
    global API middleware — repeatedly viewing a proposal is normal
    customer behavior (reloading a page, opening on a second device).

13. **No notification dispatch.** Unlike ServiceOrder (ADR-012), this gate
    does not wire any notification on submit/approve/reject. The
    `App\Notifications\Support\NotificationEventType` vocabulary was
    reviewed for naming consistency should a future gate add
    `budget_submitted`/`budget_approved`/`budget_rejected` events, but no
    such events are emitted here.

## Consequences

- Every money/margin rule lives in exactly one place
  (`BudgetCalculator`), so a future backend gate correcting a formula only
  has one call site to change.
- The public proposal surface is structurally incapable of leaking
  tenant-internal data, because the exclusion list is enforced by a
  separate Resource class shape rather than a runtime "hide these fields"
  filter that a future field addition could silently bypass.
- Reusing `App\ServiceOrders\Money`/the locking and allocator patterns
  verbatim means the two domains' race-safety guarantees are proven by
  the same, already-battle-tested mechanism — the Budget-specific
  concurrency tests only had to prove the *new* races (number allocation
  contention was already proven correct by `ServiceOrderNumberAllocator`
  reuse; only the Budget-specific interactions — item-mutation-vs-submit,
  public-vs-manual decision — needed fresh coverage).
- A future gate implementing PDF proposal generation, WhatsApp delivery
  of the public link, or converting an approved Budget into a
  ServiceOrder/Project will build on `PublicProposalResource`'s shape
  (and each item's `type`/`calculator_type`/`calculation_snapshot`
  fields on the authenticated side) as the stable contract — none of
  these should be casually restructured without checking those
  consumers.

## Deferred to a later gate

- Notification dispatch (submitted/approved/rejected events).
- PDF generation of the proposal.
- WhatsApp delivery of the public link.
- Any conversion of an approved Budget into a Project/ServiceOrder/
  financial record.
- A re-open/revise action for a rejected or pending Budget.
