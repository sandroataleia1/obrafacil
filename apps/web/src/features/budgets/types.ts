/**
 * Real API domain contract for Orçamentos (Budgets) — mirrors
 * `App\Http\Resources\BudgetResource` / `BudgetListResource` /
 * `BudgetItemResource` / `PublicProposalResource` /
 * `PublicProposalItemResource` and the Store/Update Form Requests in
 * `apps/api` field-for-field. Never invent a field here without a
 * matching backend source (re-verify against the PHP files, not just
 * this file's own history, whenever behavior seems to disagree).
 *
 * Money fields are ALWAYS `string | null` — decimal strings from the
 * API, never a JS number. Quantity is ALWAYS a decimal string
 * ("1.000"). `margin_amount`/`margin_percentage`/`cost_subtotal` are
 * `null` whenever any item is missing `unit_cost` — never coerce
 * `null` to `"0.00"` or to a JS `0`.
 */

export type BudgetStatus = "draft" | "pending_approval" | "approved" | "rejected";

export type BudgetItemSourceType = "catalog" | "calculator" | "manual";

export type BudgetCalculatorType = "masonry" | "floor" | "ceiling" | "slab";

export type BudgetDecisionSource = "public_link" | "manual_internal";

export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovado",
  rejected: "Recusado",
};

/** The historical customer snapshot embedded in `BudgetResource`. */
export interface BudgetCustomerSnapshot {
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
}

/** The lean customer summary embedded in `BudgetListResource`. */
export interface BudgetListCustomer {
  id: string;
  name: string;
}

/**
 * The Company's address, as embedded in `company_snapshot` (PROPOSAL-DOC-01A
 * `CompanyProposalSnapshotBuilder`) — mirrors `CompanyProfileResource`'s
 * address shape field-for-field. Individual fields may be `null`; the
 * object itself is always present whenever the surrounding company block
 * is (never `null` on its own).
 */
export interface ProposalCompanyAddress {
  postal_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  reference_point: string | null;
}

/**
 * The frozen Company identity/contact/address block — built once from
 * `company_snapshot` + `proposal_logo_path` at submit time (or, for a
 * draft preview, from the LIVE Company on the fly, never persisted).
 * Deliberately excludes `company_id` and any raw storage path — only
 * `logo_url` (already a public URL), matching `CompanyProfileResource`'s
 * `logo_path`/`logo_url` split.
 */
export interface ProposalCompany {
  name: string;
  legal_name: string | null;
  trade_name: string | null;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: ProposalCompanyAddress;
  logo_url: string | null;
}

/** `BudgetResource.proposal_company` — additionally carries `timezone` (authenticated-only; never exposed on the public contract). */
export interface BudgetProposalCompany extends ProposalCompany {
  timezone: string | null;
}

/** A row of `BudgetItemResource` — full authenticated item shape. */
export interface BudgetItem {
  id: string;
  source_type: BudgetItemSourceType;
  catalog_item_id: string | null;
  type: string | null;
  calculator_type: BudgetCalculatorType | null;
  code: string | null;
  name: string;
  unit: string | null;
  description: string | null;
  /** Decimal string, up to 3 decimals, e.g. "1.000". */
  quantity: string;
  /** Decimal string, e.g. "150.00". Never null per StoreBudgetItemRequest for non-catalog. */
  unit_price: string;
  unit_cost: string | null;
  line_discount: string;
  line_total: string;
  line_cost_total: string | null;
  calculation_snapshot: Record<string, unknown> | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** GET/POST/PUT /api/v1/budgets/{id} — the full authenticated shape. */
export interface Budget {
  id: string;
  /** Formatted "ORC-000001" — always shown verbatim, never reformatted client-side. */
  number: string;
  status: BudgetStatus;

  customer_id: string;
  title: string;
  reference: string | null;
  /** Internal-only ("Observações internas") — never shown on the public proposal. */
  notes: string | null;

  /** Client-facing proposal conditions — editable while draft, frozen forever once submitted. */
  valid_until: string | null;
  payment_terms: string | null;
  execution_terms: string | null;
  proposal_terms: string | null;

  customer: BudgetCustomerSnapshot;

  sale_subtotal: string;
  cost_subtotal: string | null;
  margin_amount: string | null;
  margin_percentage: string | null;
  discount_amount: string;
  total: string;

  proposal_token: string | null;
  submitted_at: string | null;
  /** `null` while draft. Frozen at submit — `1` renders template v1; never shown to the end user. */
  proposal_template_version: number | null;
  /** The frozen Company snapshot + derived logo — `null` while draft, present once submitted. */
  proposal_company: BudgetProposalCompany | null;

  decision_source: BudgetDecisionSource | null;
  decision_by_user_id: string | null;
  decision_by_name: string | null;
  decision_note: string | null;
  decided_at: string | null;

  items: BudgetItem[];

  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

/** A row from GET /api/v1/budgets. */
export interface BudgetListItem {
  id: string;
  number: string;
  status: BudgetStatus;
  title: string;
  reference: string | null;
  customer: BudgetListCustomer;
  sale_subtotal: string;
  margin_amount: string | null;
  margin_percentage: string | null;
  discount_amount: string;
  total: string;
  submitted_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Laravel's default paginate() JSON shape. */
export interface BudgetPaginationResponse {
  data: BudgetListItem[];
  meta: {
    current_page: number;
    from: number | null;
    last_page: number;
    per_page: number;
    to: number | null;
    total: number;
  };
  links: {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
  };
}

export interface BudgetListParams {
  search?: string;
  status?: BudgetStatus;
  page?: number;
  perPage?: number;
}

/** One entry of `BudgetCreatePayload.items` — the union of every
 * source_type's accepted fields, matching `StoreBudgetRequest`/
 * `StoreBudgetItemRequest` item-for-item. Never `id`/`company_id`/
 * `budget_id`/`type`/`line_total`/`line_cost_total`. */
export interface BudgetItemCreatePayload {
  source_type: BudgetItemSourceType;
  /** Required + only for source_type "catalog". */
  catalog_item_id?: string;
  /** Required + only for source_type "calculator". */
  calculator_type?: BudgetCalculatorType;
  /** Prohibited for "catalog"; required for "manual"/"calculator". */
  name?: string;
  /** Prohibited for "catalog". Nullable for calculator/manual. */
  unit?: string | null;
  /** Prohibited for "catalog". */
  description?: string | null;
  /** Decimal string, up to 3 decimals, > 0. */
  quantity: string;
  /** Required unless source_type is "catalog" (catalog may omit to use CatalogItem.sale_price server-side). */
  unit_price?: string | null;
  /** Prohibited for "catalog" — cost always mirrors CatalogItem.cost_price server-side. */
  unit_cost?: string | null;
  line_discount?: string | null;
  /** Required + only for source_type "calculator" — the full raw calculator snapshot. */
  calculation_snapshot?: Record<string, unknown>;
  notes?: string | null;
}

/**
 * POST /api/v1/budgets. Never `id`/`company_id`/`number`/`status`/
 * `created_by_user_id`/`created_at`/`updated_at`/`project_id`/
 * `subtotal`/`sale_subtotal`/`cost_subtotal`/`margin_amount`/
 * `margin_percentage`/`total`/`proposal_token`/`calculation_snapshot`/
 * any `customer_*` snapshot field. NEVER `proposal_company`/
 * `company_snapshot`/`proposal_logo_path`/`proposal_template_version` —
 * those are server-derived exclusively at submit time
 * (`StoreBudgetRequest` rejects them outright).
 */
export interface BudgetCreatePayload {
  customer_id: string;
  title: string;
  reference?: string | null;
  notes?: string | null;
  /** Client-facing proposal conditions — plain civil date "YYYY-MM-DD" or `null`, never a JS Date. */
  valid_until?: string | null;
  payment_terms?: string | null;
  execution_terms?: string | null;
  proposal_terms?: string | null;
  discount_amount?: string;
  items?: BudgetItemCreatePayload[];
}

/**
 * PUT /api/v1/budgets/{id} — draft-only header update
 * (`UpdateBudgetRequest`). Never `items`, `status`, or any of the
 * server-derived/snapshot fields listed above.
 */
export interface BudgetUpdatePayload {
  customer_id: string;
  title: string;
  reference?: string | null;
  notes?: string | null;
  valid_until?: string | null;
  payment_terms?: string | null;
  execution_terms?: string | null;
  proposal_terms?: string | null;
  discount_amount?: string;
}

/**
 * POST /api/v1/budgets/{id}/items (`StoreBudgetItemRequest`). Identical
 * shape to `BudgetItemCreatePayload` (kept as a separate alias since the
 * two payloads are validated by two distinct backend Requests and may
 * diverge later).
 */
export type BudgetItemAddPayload = BudgetItemCreatePayload;

/**
 * PUT /api/v1/budgets/{id}/items/{itemId} (`UpdateBudgetItemRequest`) —
 * ONLY quantity/unit_price/line_discount/notes/sort_order are ever
 * accepted. `source_type`/`catalog_item_id`/`type`/`calculator_type`/
 * `code`/`name`/`unit`/`description`/`calculation_snapshot`/`unit_cost`
 * are creation-time-only snapshots and are `prohibited` server-side —
 * never included here.
 */
export interface BudgetItemUpdatePayload {
  quantity?: string;
  unit_price?: string | null;
  line_discount?: string | null;
  notes?: string | null;
  sort_order?: number;
}

/** POST /api/v1/budgets/{id}/approve-manually. */
export interface ApproveBudgetManuallyPayload {
  note?: string | null;
}

/** POST /api/v1/budgets/{id}/reject-manually. */
export interface RejectBudgetManuallyPayload {
  note?: string | null;
}

// ---------------------------------------------------------------------------
// Public proposal contract (GET/POST /api/v1/proposals/{token}) — NO auth,
// no company scoping. Deliberately excludes every internal/cost/tenant
// field (see `PublicProposalResource`/`PublicProposalItemResource`).
// ---------------------------------------------------------------------------

/** A row of `PublicProposalItemResource`. */
export interface PublicProposalItem {
  id: string;
  code: string | null;
  name: string;
  unit: string | null;
  description: string | null;
  quantity: string;
  unit_price: string;
  line_discount: string;
  line_total: string;
  sort_order: number;
}

/** GET /api/v1/proposals/{token} — the full public shape. */
export interface PublicProposal {
  number: string;
  status: BudgetStatus;
  title: string;
  reference: string | null;

  customer_name: string;

  sale_subtotal: string;
  discount_amount: string;
  total: string;

  /** Civil date "YYYY-MM-DD" — never parse via `new Date()` (§25/§50), use `civilDateToBrDisplay`. */
  valid_until: string | null;
  payment_terms: string | null;
  execution_terms: string | null;
  proposal_terms: string | null;

  /** The frozen Company identity/contact/address, from `company_snapshot` — `null` only if the Budget somehow lacks one (never expected for a submitted proposal reachable by token). */
  company: ProposalCompany | null;

  submitted_at: string | null;
  decided_at: string | null;
  decision_by_name: string | null;

  items: PublicProposalItem[];
}

/** POST /api/v1/proposals/{token}/approve (`ApproveProposalRequest`). */
export interface ApproveProposalPayload {
  name: string;
  accepted: true;
  note?: string | null;
}

/** POST /api/v1/proposals/{token}/reject (`RejectProposalRequest`). */
export interface RejectProposalPayload {
  name: string;
  note?: string | null;
}
