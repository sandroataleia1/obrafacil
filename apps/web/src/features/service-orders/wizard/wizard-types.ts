import type { Customer, CustomerAddress, CustomerContact, CustomerListItem } from "@/features/customers/types";

/** A draft line item in step 3 — display fields are a snapshot taken at
 * add-time (never re-fetched/re-edited as free text); only quantity,
 * unit price, discount and notes are user-editable inline. */
export interface DraftItem {
  clientId: string;
  catalogItemId: string;
  type: "product" | "service";
  code: string | null;
  name: string;
  unit: string;
  /** BR-typed as entered ("1", "1,5"); normalized only at submit/preview time. */
  quantityInput: string;
  /** BR-typed money as entered; normalized only at submit/preview time. */
  unitPriceInput: string;
  lineDiscountInput: string;
  notes: string;
}

export const CONTACT_NONE = "__none__" as const;

export interface WizardState {
  step: 1 | 2 | 3 | 4;
  /** The customer chosen in step 1 — a search result row or a freshly quick-created one. */
  selectedCustomer: CustomerListItem | Customer | null;
  /** Full detail (addresses/contacts) fetched on entering step 2 — never the abbreviated list shape. */
  customerDetail: Customer | null;
  selectedAddressId: string | null;
  /** `CONTACT_NONE` for the explicit "Sem contato" choice, otherwise a CustomerContact id. */
  selectedContactId: string;
  items: DraftItem[];
  title: string;
  description: string;
  scheduledStart: string;
  scheduledEnd: string;
  travelFeeInput: string;
  orderDiscountInput: string;
  notes: string;
}

export function emptyWizardState(): WizardState {
  return {
    step: 1,
    selectedCustomer: null,
    customerDetail: null,
    selectedAddressId: null,
    selectedContactId: CONTACT_NONE,
    items: [],
    title: "",
    description: "",
    scheduledStart: "",
    scheduledEnd: "",
    travelFeeInput: "",
    orderDiscountInput: "0,00",
    notes: "",
  };
}

export function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}`;
}

export function findAddress(detail: Customer | null, addressId: string | null): CustomerAddress | null {
  if (!detail || !addressId) return null;
  return detail.addresses.find((address) => address.id === addressId) ?? null;
}

export function findContact(detail: Customer | null, contactId: string): CustomerContact | null {
  if (!detail || contactId === CONTACT_NONE) return null;
  return detail.contacts.find((contact) => contact.id === contactId) ?? null;
}
