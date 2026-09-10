/**
 * LEGACY/TRANSITION (FRONTEND-CLIENTS-01 §7/§89): the pre-API prototype
 * shape for Clientes, kept only so `customer-store.ts`'s localStorage data
 * and its remaining consumer (`features/receivables`, not migrated this
 * round) keep compiling. The real Clientes module now uses the API
 * contract in `../types.ts` exclusively and never imports this file.
 */
export interface LegacyCustomer {
  id: string;
  name: string;
  /** Digits only (e.g. "11999999999"). Formatted for display where shown. */
  phone: string;
  email?: string;
  document?: string;
  createdAt: string;
  updatedAt: string;
}
