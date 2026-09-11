/**
 * Real API domain contract for Ordens de serviço (O.S.) — mirrors
 * `App\Http\Resources\ServiceOrderResource` / `ServiceOrderListResource` /
 * `ServiceOrderItemResource` / `ServiceOrderSettingsResource` and the
 * Store Form Request in `apps/api` field-for-field. Never invent a field
 * here without a matching backend source.
 *
 * There is deliberately no Obra/Project field anywhere in this file —
 * an O.S. is tied only to a Customer + CustomerAddress, never a Project
 * (CLAUDE.md frontend-prototype scope for this round explicitly excludes
 * Obra/Project linkage from Service Orders).
 */

export type ServiceOrderStatus = "open" | "in_progress" | "completed" | "cancelled";

export type ServiceOrderItemType = "product" | "service";

/** A customer summary as embedded in `ServiceOrderListResource`. */
export interface ServiceOrderListCustomer {
  id: string;
  name: string;
}

/** The execution-address summary embedded in `ServiceOrderListResource`. */
export interface ServiceOrderListAddress {
  label: string;
  city: string | null;
  state: string | null;
}

/** The contact summary embedded in `ServiceOrderListResource`. */
export interface ServiceOrderListContact {
  name: string;
  role: string | null;
}

/** A row from GET /api/v1/service-orders. */
export interface ServiceOrderListItem {
  id: string;
  /** Formatted "OS-000001" — always shown verbatim, never reformatted client-side. */
  number: string;
  status: ServiceOrderStatus;
  title: string;
  customer: ServiceOrderListCustomer;
  execution_address: ServiceOrderListAddress;
  contact: ServiceOrderListContact | null;
  scheduled_start_at: string | null;
  /** Decimal string, e.g. "150.00". */
  subtotal: string;
  order_discount: string;
  travel_fee: string;
  total: string;
  created_at: string;
  updated_at: string;
}

/** The full customer snapshot embedded in `ServiceOrderResource`. */
export interface ServiceOrderCustomerSnapshot {
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
}

/** The full execution-address snapshot embedded in `ServiceOrderResource`. */
export interface ServiceOrderAddressSnapshot {
  label: string;
  type: string;
  postal_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  reference_point: string | null;
}

/** The full contact snapshot embedded in `ServiceOrderResource`. */
export interface ServiceOrderContactSnapshot {
  name: string;
  role: string | null;
  department: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
}

/** GET/POST/PUT /api/v1/service-orders/{id} — items only when eager-loaded. */
export interface ServiceOrder {
  id: string;
  number: string;
  status: ServiceOrderStatus;
  title: string;
  customer_id: string;
  customer_address_id: string;
  customer_contact_id: string | null;
  responsible_user_id: string | null;
  description: string | null;
  customer: ServiceOrderCustomerSnapshot;
  execution_address: ServiceOrderAddressSnapshot;
  contact: ServiceOrderContactSnapshot | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  subtotal: string;
  order_discount: string;
  travel_fee: string;
  total: string;
  items?: ServiceOrderItem[];
  created_at: string;
  updated_at: string;
}

/** A row of `ServiceOrderResource.items`. */
export interface ServiceOrderItem {
  id: string;
  catalog_item_id: string;
  type: ServiceOrderItemType;
  code: string | null;
  name: string;
  unit: string;
  description: string | null;
  /** Decimal string, 3 decimals, e.g. "1.500". */
  quantity: string;
  /** Decimal string, 2 decimals, e.g. "150.00". */
  unit_price: string;
  line_discount: string;
  line_total: string;
  notes: string | null;
  sort_order: number;
}

/** Laravel's default paginate() JSON shape. */
export interface ServiceOrderPaginationResponse {
  data: ServiceOrderListItem[];
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

/** A single item entry inside `ServiceOrderCreatePayload.items`. */
export interface ServiceOrderItemCreatePayload {
  catalog_item_id: string;
  quantity: string;
  unit_price?: string | null;
  line_discount?: string | null;
  notes?: string | null;
}

/**
 * POST /api/v1/service-orders. Field-for-field only what
 * `StoreServiceOrderRequest` accepts — never `id`, `company_id`,
 * `number`, `status`, `created_by_user_id`, `created_at`, `updated_at`,
 * `project_id`, `subtotal`, `total`, any snapshot field, or any
 * per-item `id`/`company_id`/`service_order_id`/`type`/`code`/`name`/
 * `unit`/`description`/`line_total`.
 */
export interface ServiceOrderCreatePayload {
  customer_id: string;
  customer_address_id: string;
  customer_contact_id: string | null;
  /** Always `null` this round — there is no Company-members-list endpoint yet. */
  responsible_user_id: string | null;
  title: string;
  description: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  order_discount: string;
  travel_fee: string;
  notes: string | null;
  items: ServiceOrderItemCreatePayload[];
}

/** GET/PUT /api/v1/service-orders/settings. */
export interface ServiceOrderSettings {
  default_travel_fee: string;
}

export interface ServiceOrderListParams {
  search?: string;
  page?: number;
  perPage?: number;
  status?: ServiceOrderStatus;
}
