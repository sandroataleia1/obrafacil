/**
 * UI/prototype model for Clientes. NOT the definitive domain contract for
 * the future API — only exists to validate the product experience with
 * mocked/local data.
 */

export interface Customer {
  id: string;
  name: string;
  /** Digits only (e.g. "11999999999"). Formatted for display where shown. */
  phone: string;
  email?: string;
  document?: string;
  createdAt: string;
  updatedAt: string;
}
