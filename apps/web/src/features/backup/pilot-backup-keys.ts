/**
 * Central, explicit registry of every `localStorage` key eligible for
 * the pilot backup (Pilot-Ready "PILOT-02 — Backup e Restauração").
 *
 * Deliberately NOT `Object.keys(localStorage).filter(k =>
 * k.startsWith("obrafacil:"))` — that would silently pick up the
 * session key, any future UI-state key, or anything else that happens
 * to share the prefix. Every key here was confirmed by reading each
 * store's own `STORAGE_KEY`/`DELETED_KEY` constant, not guessed.
 *
 * `obrafacil:demo-auth-session` (the ONLY session/auth key that
 * exists — `features/auth/demo-auth.ts`) is intentionally absent —
 * see §4 of the PILOT-02 gate: backup/restore must never touch who is
 * logged in.
 *
 * Also intentionally absent: `obrafacil:pending-project`,
 * `obrafacil:pending-budget-item`, `obrafacil:ceiling-print-payload` —
 * all three live in `sessionStorage`, not `localStorage` (ephemeral
 * hand-off state between two screens, cleared when the tab closes),
 * so they are not even readable through this registry's
 * `localStorage`-only access pattern.
 *
 * Shape per key (both confirmed by reading every store's read/write
 * functions — every store in this codebase follows one of exactly two
 * shapes):
 * - "object": a `Record<string, T>` keyed by id (the store's own
 *   records — an absent key and `{}` are the same "no override yet"
 *   state to every store's `readStore()`).
 * - "array": a plain `string[]` of soft-deleted seed ids (the
 *   store's tombstone set, so a user-deleted seed record does not
 *   reappear after export/restore).
 */
export type PilotBackupValueShape = "object" | "array";

export const PILOT_BACKUP_STORAGE_KEYS: Readonly<Record<string, PilotBackupValueShape>> = {
  // Obras (FRONTEND-PROJECTS-01: Project itself moved to the real API —
  // "obrafacil:projects"/"obrafacil:projects:deleted" are no longer
  // read/written anywhere and are intentionally absent here. Equipe
  // assignments are still a localStorage prototype, keyed by the real
  // Project UUID.)
  "obrafacil:project-team-assignments": "object",

  // Clientes
  "obrafacil:customers": "object",
  "obrafacil:customers:deleted": "array",

  // Equipe
  "obrafacil:employees": "object",
  "obrafacil:employees:deleted": "array",
  "obrafacil:employee-work-periods": "object",
  "obrafacil:employee-period-allocations": "object",

  // Fornecedores (SUPPLY-FRONTEND-01A: Supplier itself moved to the real
  // API — "obrafacil:suppliers"/"obrafacil:suppliers:deleted" are no
  // longer read/written anywhere and are intentionally absent here.)

  // Materiais (SUPPLY-FRONTEND-01A: Material itself moved to the real
  // API — "obrafacil:materials"/"obrafacil:materials:deleted" are no
  // longer read/written anywhere and are intentionally absent here.
  // SUPPLY-FRONTEND-01B1: MaterialRequirement is ALSO the real API now —
  // "obrafacil:material-requirements"/"obrafacil:material-requirements:deleted"
  // are no longer read/written anywhere and are intentionally absent
  // here too. MaterialConsumption remains a local prototype, keyed by
  // the real Material UUID.)
  "obrafacil:material-consumptions": "object",
  "obrafacil:material-consumptions:deleted": "array",

  // Compras
  "obrafacil:purchase-orders": "object",
  "obrafacil:purchase-orders:deleted": "array",
  "obrafacil:purchase-order-items": "object",
  "obrafacil:purchase-order-items:deleted": "array",
  "obrafacil:goods-receipts": "object",
  "obrafacil:goods-receipts:deleted": "array",
  "obrafacil:goods-receipt-items": "object",
  "obrafacil:goods-receipt-items:deleted": "array",

  // Estoque
  "obrafacil:stock-adjustments": "object",
  "obrafacil:stock-adjustments:deleted": "array",

  // Orçamentos
  "obrafacil:budgets": "object",
  "obrafacil:budgets:deleted": "array",

  // Custos de obra
  "obrafacil:project-costs": "object",
  "obrafacil:project-costs:deleted": "array",

  // Financeiro
  "obrafacil:payables": "object",
  "obrafacil:payables:deleted": "array",
  "obrafacil:receivables": "object",
  "obrafacil:receivables:deleted": "array",
  "obrafacil:receipts": "object",
  "obrafacil:receipts:deleted": "array",
};

export function isAuthorizedPilotBackupKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(PILOT_BACKUP_STORAGE_KEYS, key);
}
