/**
 * Real API domain contract for Clientes (FRONTEND-CLIENTS-01) — mirrors
 * `App\Http\Resources\CustomerResource` / `CustomerListResource` /
 * `CustomerAddressResource` / `CustomerContactResource` and the
 * Store/Update Form Requests in `apps/api` field-for-field. Never invent a
 * field here without a matching backend source.
 */

export type CustomerKind = "individual" | "company";

export type CustomerAddressType =
  | "residential"
  | "commercial"
  | "work_site"
  | "billing"
  | "delivery"
  | "other";

export interface CustomerAddress {
  id: string;
  label: string;
  type: CustomerAddressType;
  postal_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  reference_point: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerContact {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
  /** E.164 (e.g. "+5531999999999") or null. */
  phone: string | null;
  /** E.164 or null. */
  whatsapp: string | null;
  email: string | null;
  notes: string | null;
  is_primary: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** GET/POST/PUT /api/v1/customers/{customer} — full detail. */
export interface Customer {
  id: string;
  kind: CustomerKind;
  name: string;
  legal_name: string | null;
  trade_name: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  addresses: CustomerAddress[];
  contacts: CustomerContact[];
  created_at: string;
  updated_at: string;
}

/** A row from GET /api/v1/customers — only the primary address/contact. */
export interface CustomerListItem {
  id: string;
  kind: CustomerKind;
  name: string;
  legal_name: string | null;
  trade_name: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  primary_address: CustomerAddress | null;
  primary_contact: CustomerContact | null;
  created_at: string;
  updated_at: string;
}

/** Laravel's default paginate() JSON shape. */
export interface CustomerPaginationResponse {
  data: CustomerListItem[];
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

export interface AddressCreatePayload {
  label: string;
  type: CustomerAddressType;
  postal_code?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  reference_point?: string | null;
  is_primary?: boolean;
}

export type AddressUpdatePayload = AddressCreatePayload;

export interface ContactCreatePayload {
  name: string;
  role?: string | null;
  department?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  notes?: string | null;
  is_primary?: boolean;
  active?: boolean;
}

export type ContactUpdatePayload = ContactCreatePayload;

/** POST /api/v1/customers — Customer + addresses + contacts, atomically. */
export interface CustomerCreatePayload {
  kind: CustomerKind;
  name: string;
  legal_name?: string | null;
  trade_name?: string | null;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  active?: boolean;
  addresses?: AddressCreatePayload[];
  contacts?: ContactCreatePayload[];
}

/**
 * PUT /api/v1/customers/{customer} — Customer's own fields only (§57).
 * Addresses/contacts are never sent here; they have their own endpoints.
 */
export interface CustomerUpdatePayload {
  kind: CustomerKind;
  name: string;
  legal_name?: string | null;
  trade_name?: string | null;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  active?: boolean;
}

export interface PostalCodeLookupResult {
  postal_code: string;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  provider_complement: string | null;
}

export interface CompanyRegistryLookupResult {
  document: string;
  legal_name: string;
  trade_name: string | null;
  phone: string | null;
  email: string | null;
  address: {
    postal_code: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  };
}
