/**
 * FRONTEND-PROJECTS-01. Real API domain contract for Obras — mirrors
 * `App\Http\Resources\ProjectResource` / `ProjectListResource` and the
 * Store/Update Form Requests in `apps/api` field-for-field. Never invent a
 * field here without a matching backend source (see ADR-016).
 */

export type ProjectStatus = "planning" | "in_progress" | "paused" | "completed";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
};

export const PROJECT_STATUS_FILTER_OPTIONS: { value: ProjectStatus | ""; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "planning", label: "Planejamento" },
  { value: "in_progress", label: "Em andamento" },
  { value: "paused", label: "Pausadas" },
  { value: "completed", label: "Concluídas" },
];

export interface ProjectCustomer {
  id: string;
  name: string;
}

export interface ProjectSourceBudget {
  id: string;
  number: string;
  /** Decimal string, 2 decimals, e.g. "1500.00". */
  total: string;
}

export interface ProjectAddress {
  postal_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  reference_point: string | null;
}

/** GET/POST/PUT /api/v1/projects/{project} — full detail. */
export interface Project {
  id: string;
  number: string;
  name: string;
  status: ProjectStatus;
  reference: string | null;
  customer: ProjectCustomer;
  customer_address_id: string | null;
  address: ProjectAddress | null;
  /** Date-only "YYYY-MM-DD", or null. */
  expected_start_date: string | null;
  /** Date-only "YYYY-MM-DD", or null. */
  expected_end_date: string | null;
  source_budget: ProjectSourceBudget | null;
  created_at: string;
  updated_at: string;
}

/** A row from GET /api/v1/projects — lean shape, mirrors ProjectListResource. */
export interface ProjectListItem {
  id: string;
  number: string;
  name: string;
  status: ProjectStatus;
  reference: string | null;
  customer: ProjectCustomer;
  expected_start_date: string | null;
  expected_end_date: string | null;
  source_budget: ProjectSourceBudget | null;
  created_at: string;
  updated_at: string;
}

/** Laravel's default paginate() JSON shape. */
export interface ProjectPaginationResponse {
  data: ProjectListItem[];
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

export interface ProjectAddressInput {
  postal_code?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  reference_point?: string | null;
}

/**
 * POST /api/v1/projects. Field-for-field only what `StoreProjectRequest`
 * accepts — never `id`, `company_id`, `number`, `status`, `created_at`,
 * `updated_at`, or any raw `address_*` column name (only the nested
 * `address` shape).
 */
export interface ProjectCreatePayload {
  name: string;
  reference?: string | null;
  customer_id: string;
  customer_address_id?: string | null;
  address?: ProjectAddressInput | null;
  expected_start_date?: string | null;
  expected_end_date?: string | null;
  source_budget_id?: string | null;
}

/**
 * PUT /api/v1/projects/{project} — partial update (`sometimes` on the
 * backend). `updated_at` is REQUIRED as the optimistic-concurrency
 * precondition — always the exact value last read from a `Project`.
 * `source_budget_id` is never sent here — immutable after creation.
 */
export interface ProjectUpdatePayload {
  updated_at: string;
  name?: string;
  reference?: string | null;
  status?: ProjectStatus;
  customer_id?: string;
  customer_address_id?: string | null;
  address?: ProjectAddressInput | null;
  expected_start_date?: string | null;
  expected_end_date?: string | null;
}

export interface ProjectListParams {
  search?: string;
  page?: number;
  perPage?: number;
  status?: ProjectStatus;
}
