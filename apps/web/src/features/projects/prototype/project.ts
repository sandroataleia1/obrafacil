/**
 * Domain operations for editing Project (Obra) basic metadata.
 * `project-store.ts` is pure persistence with no guards — every
 * invariant below lives here instead, mirroring
 * `features/budgets/prototype/budget.ts` and
 * `features/payables/prototype/payable.ts` (Demo-Ready 003).
 *
 * Status editing keeps its own existing mechanism in
 * `project-detail.tsx` (a direct `persist()` call from `useProject`) —
 * untouched by this module, out of scope for this task.
 *
 * `customerId` participates in two invariants this module enforces
 * before allowing a change:
 *
 *   - a Project with `budgetId` set is tied to that Budget's own
 *     Customer; changing the Project's customer would silently desync
 *     `Project.customerId` from `Budget.customerId`, so it's blocked
 *     outright while a Budget is linked — no auto-sync, no Budget
 *     mutation (see `features/budgets/prototype/budget.ts`'s own
 *     "no versioning" stance for the same reasoning);
 *   - a Project with any Receivable already pointing at it
 *     (`Receivable.projectId === project.id`) has that Receivable's
 *     own `customerId` validated against the Project's customer at
 *     the moment it was created (see
 *     `features/receivables/prototype/receivable.ts`'s
 *     `validateCustomerProject`); changing the Project's customer
 *     afterward would make that already-persisted invariant stale, so
 *     it's blocked whenever any Receivable exists for this Project.
 *
 * Neither dependency touches PurchaseOrder/GoodsReceipt/
 * MaterialConsumption/ProjectCost/Payable — none of those store a
 * customer, so editing name/address/reference never affects them, and
 * a blocked customer change never needs to reach them either.
 */

import { todayIso } from "@/lib/date";
import { getCustomer } from "@/features/customers/prototype/customer-store";
import { listReceivablesByProject } from "@/features/receivables/prototype/receivable-store";
import { saveProject } from "./project-store";
import type { Project } from "../types";

export type ProjectResult = { ok: true; project: Project } | { ok: false; error: string };

export interface ProjectDetailsChanges {
  name: string;
  customerId: string;
  reference?: string;
  address?: string;
  expectedStartDate?: string;
  expectedEndDate?: string;
}

/** Basic metadata only — name/customer/reference/address/expected
 * start/end date. `id`, `budgetId`, `status`, `createdAt` are always
 * carried over from `existing`, never taken from `changes`. */
export function updateProjectDetails(existing: Project, changes: ProjectDetailsChanges): ProjectResult {
  if (changes.name.trim() === "") {
    return { ok: false, error: "Informe o nome da obra." };
  }

  if (changes.customerId !== existing.customerId) {
    if (existing.budgetId) {
      return {
        ok: false,
        error: "Esta obra está vinculada a um orçamento e não pode trocar de cliente.",
      };
    }
    if (listReceivablesByProject(existing.id).length > 0) {
      return {
        ok: false,
        error: "Esta obra já possui contas a receber vinculadas e não pode trocar de cliente.",
      };
    }
  }

  const customer = getCustomer(changes.customerId);
  if (!customer) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  const updated: Project = {
    ...existing,
    name: changes.name.trim(),
    customerId: customer.id,
    customerName: customer.name,
    reference: changes.reference?.trim() || undefined,
    address: changes.address?.trim() || undefined,
    expectedStartDate: changes.expectedStartDate || undefined,
    expectedEndDate: changes.expectedEndDate || undefined,
    updatedAt: todayIso(),
  };
  saveProject(updated);
  return { ok: true, project: updated };
}
