import { PILOT_BACKUP_STORAGE_KEYS } from "./pilot-backup-keys";

type PilotBackupKey = keyof typeof PILOT_BACKUP_STORAGE_KEYS;

/**
 * Subset of the pilot backup registry cleared by "Zerar dados de teste":
 * Obras, Orçamentos, Cálculos (custos de obra), Compras, Estoque e
 * Clientes — scoped exactly to what was requested. Fornecedores, Equipe,
 * Materiais (catálogo) e Financeiro (contas a pagar/receber) ficam de
 * fora deliberadamente.
 *
 * Each entry is typed against `PILOT_BACKUP_STORAGE_KEYS` so a typo or a
 * renamed store key fails at compile time instead of silently no-op'ing.
 */
export const PILOT_RESET_KEYS: readonly PilotBackupKey[] = [
  // Obras
  "obrafacil:projects",
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

/** Pure side effect: removes exactly `PILOT_RESET_KEYS` from `localStorage`.
 * Never touches the auth/session key or any key outside this list. */
export function resetPilotTestData(): void {
  if (typeof window === "undefined") return;
  for (const key of PILOT_RESET_KEYS) {
    window.localStorage.removeItem(key);
  }
}
