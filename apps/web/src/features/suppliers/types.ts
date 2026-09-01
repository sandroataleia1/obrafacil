/**
 * UI/prototype model for Fornecedores (suppliers).
 *
 * `status` is stored directly (not derived) — unlike Payable/Receivable,
 * a Supplier's active/inactive state is a deliberate user decision, not
 * something computable from dates or amounts.
 *
 * Inactivating a Supplier is the normal removal path, not deletion: an
 * inactive Supplier stays fully visible in its own detail screen and in
 * any historical record that references it, it just stops being
 * offered as an option for new work. `deleteSupplier()` exists in the
 * store for this v1 (no PurchaseOrder exists yet to depend on a
 * Supplier), but Task 040 must harden this once PurchaseOrder exists —
 * a Supplier with any PurchaseOrder should no longer be deletable,
 * mirroring the dependency guards already used elsewhere (Payable with
 * Receipt, Receivable with Receipt).
 *
 * Deliberately excluded from this v1: ranking, rating, price tables,
 * contracts — none of those have a real use case yet.
 *
 * NOT the definitive domain contract for the future API — only exists
 * to validate the product experience with mocked/local data.
 */

export type SupplierStatus = "active" | "inactive";

export interface Supplier {
  id: string;
  name: string;

  document?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;

  status: SupplierStatus;

  createdAt: string;
  updatedAt: string;
}

export const SUPPLIER_STATUS_LABEL: Record<SupplierStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

export const SUPPLIER_STATUS_FILTERS = ["all", "active", "inactive"] as const;
export type SupplierStatusFilter = (typeof SUPPLIER_STATUS_FILTERS)[number];

export const SUPPLIER_STATUS_FILTER_LABEL: Record<SupplierStatusFilter, string> = {
  all: "Todos",
  active: "Ativos",
  inactive: "Inativos",
};
