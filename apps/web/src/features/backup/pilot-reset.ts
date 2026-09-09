import { customers as seedCustomers } from "@/mocks/customers";
import { projects as seedProjects } from "@/mocks/projects";
import { budgets as seedBudgets } from "@/mocks/budgets";
import { projectCosts as seedProjectCosts } from "@/mocks/project-costs";
import { purchaseOrders as seedPurchaseOrders } from "@/mocks/purchase-orders";
import { purchaseOrderItems as seedPurchaseOrderItems } from "@/mocks/purchase-order-items";
import { goodsReceipts as seedGoodsReceipts } from "@/mocks/goods-receipts";
import { goodsReceiptItems as seedGoodsReceiptItems } from "@/mocks/goods-receipt-items";
import { stockAdjustments as seedStockAdjustments } from "@/mocks/stock-adjustments";
import { materialRequirements as seedMaterialRequirements } from "@/mocks/material-requirements";
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
  // Obras
  "obrafacil:projects",
  "obrafacil:projects:deleted",
  "obrafacil:project-team-assignments",
  // Orçamentos
  "obrafacil:budgets",
  "obrafacil:budgets:deleted",
  // Cálculos (custos de obra)
  "obrafacil:project-costs",
  "obrafacil:project-costs:deleted",
  // Necessidade de material / consumo (ligados a obras e compras)
  "obrafacil:material-requirements",
  "obrafacil:material-requirements:deleted",
  "obrafacil:material-consumptions",
  "obrafacil:material-consumptions:deleted",
  // Compras (materiais comprados)
  "obrafacil:purchase-orders",
  "obrafacil:purchase-orders:deleted",
  "obrafacil:purchase-order-items",
  "obrafacil:purchase-order-items:deleted",
  "obrafacil:goods-receipts",
  "obrafacil:goods-receipts:deleted",
  "obrafacil:goods-receipt-items",
  "obrafacil:goods-receipt-items:deleted",
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
  { deletedKey: "obrafacil:projects:deleted", ids: seedProjects.map((row) => row.id) },
  { deletedKey: "obrafacil:budgets:deleted", ids: seedBudgets.map((row) => row.id) },
  { deletedKey: "obrafacil:project-costs:deleted", ids: seedProjectCosts.map((row) => row.id) },
  { deletedKey: "obrafacil:purchase-orders:deleted", ids: seedPurchaseOrders.map((row) => row.id) },
  { deletedKey: "obrafacil:purchase-order-items:deleted", ids: seedPurchaseOrderItems.map((row) => row.id) },
  { deletedKey: "obrafacil:goods-receipts:deleted", ids: seedGoodsReceipts.map((row) => row.id) },
  { deletedKey: "obrafacil:goods-receipt-items:deleted", ids: seedGoodsReceiptItems.map((row) => row.id) },
  { deletedKey: "obrafacil:stock-adjustments:deleted", ids: seedStockAdjustments.map((row) => row.id) },
  { deletedKey: "obrafacil:material-requirements:deleted", ids: seedMaterialRequirements.map((row) => row.id) },
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
