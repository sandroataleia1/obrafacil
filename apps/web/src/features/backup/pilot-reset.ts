import { customers as seedCustomers } from "@/mocks/customers";
import { budgets as seedBudgets } from "@/mocks/budgets";
import { projectCosts as seedProjectCosts } from "@/mocks/project-costs";
import { stockAdjustments as seedStockAdjustments } from "@/mocks/stock-adjustments";
import { materialConsumptions as seedMaterialConsumptions } from "@/mocks/material-consumptions";

import { PILOT_BACKUP_STORAGE_KEYS } from "./pilot-backup-keys";

type PilotBackupKey = keyof typeof PILOT_BACKUP_STORAGE_KEYS;

/**
 * Every key cleared by "Zerar dados de teste": Obras, Orçamentos,
 * Cálculos (custos de obra), Compras, Estoque e Clientes — scoped
 * exactly to what was requested. Fornecedores, Equipe, Materiais
 * (catálogo) e Financeiro ficam de fora deliberadamente.
 *
 * `obrafacil:project-team-assignments` has no seed-hide entry below
 * (see `SEED_HIDE_GROUPS`) — its own store deliberately has no delete,
 * only "Encerrar alocação" (preserves history), and it's only reachable
 * through a project, which is already hidden once its own seed is
 * hidden.
 */
export const PILOT_RESET_KEYS: readonly PilotBackupKey[] = [
  // Obras (Project itself is the real API now — nothing to reset here)
  "obrafacil:project-team-assignments",
  // Orçamentos
  "obrafacil:budgets",
  "obrafacil:budgets:deleted",
  // Cálculos (custos de obra)
  "obrafacil:project-costs",
  "obrafacil:project-costs:deleted",
  // Consumo (MaterialRequirement é API real — não é mais domínio local)
  "obrafacil:material-consumptions",
  "obrafacil:material-consumptions:deleted",
  // Compras (PurchaseOrder/GoodsReceipt são API real desde
  // SUPPLY-FRONTEND-01C — não são mais domínio local; nunca limpar
  // browser storage automaticamente não se aplica aqui, pois essas
  // chaves simplesmente não existem mais)
  // Estoque
  "obrafacil:stock-adjustments",
  "obrafacil:stock-adjustments:deleted",
  // Clientes
  "obrafacil:customers",
  "obrafacil:customers:deleted",
];

/**
 * Domains where seed (example) rows must also disappear, not just this
 * browser's own overrides. Each store already merges its seed array
 * with a `:deleted` tombstone set (used today when a user deletes a
 * seed record) — reset reuses that exact mechanism by marking every
 * current seed id as deleted, instead of teaching stores a new concept.
 */
const SEED_HIDE_GROUPS: ReadonlyArray<{ deletedKey: PilotBackupKey; ids: readonly string[] }> = [
  { deletedKey: "obrafacil:customers:deleted", ids: seedCustomers.map((row) => row.id) },
  { deletedKey: "obrafacil:budgets:deleted", ids: seedBudgets.map((row) => row.id) },
  { deletedKey: "obrafacil:project-costs:deleted", ids: seedProjectCosts.map((row) => row.id) },
  { deletedKey: "obrafacil:stock-adjustments:deleted", ids: seedStockAdjustments.map((row) => row.id) },
  { deletedKey: "obrafacil:material-consumptions:deleted", ids: seedMaterialConsumptions.map((row) => row.id) },
];

/**
 * Pure side effect: removes every `PILOT_RESET_KEYS` override from
 * `localStorage`, then hides every seed row in `SEED_HIDE_GROUPS` by
 * writing its id into the domain's own `:deleted` tombstone. Never
 * touches the auth/session key or any key outside these lists.
 */
export function resetPilotTestData(): void {
  if (typeof window === "undefined") return;

  for (const key of PILOT_RESET_KEYS) {
    window.localStorage.removeItem(key);
  }

  for (const { deletedKey, ids } of SEED_HIDE_GROUPS) {
    window.localStorage.setItem(deletedKey, JSON.stringify(ids));
  }
}
