/**
 * SUPPLY-FRONTEND-01A §40-42. `Supplier.phone` is E.164
 * (`+5511999999999`) on the API — `formatPhoneInput` from `lib/phone.ts`
 * was built for BR-local digit typing and must NEVER receive a `+55`
 * string directly (it would mis-slice the digits). These two adapters
 * are the only sanctioned crossing point between the BR-masked input a
 * user types and the E.164 string the API contract requires — thin
 * wrappers over the already-existing, already-tested
 * `formatE164PhoneForDisplay` (`lib/document.ts`) and `toE164BR`
 * (`features/auth/phone-e164.ts`), kept local to this feature so the
 * naming reads unambiguously at every Supplier call site.
 */

import { formatE164PhoneForDisplay } from "@/lib/document";
import { toE164BR } from "@/features/auth/phone-e164";
import { formatPhoneInput } from "@/lib/phone";

/** API E.164 -> BR-masked display/input value, e.g. "+5511999999999" -> "(11) 99999-9999". */
export function supplierPhoneApiToInput(e164: string | null): string {
  return formatE164PhoneForDisplay(e164);
}

/** BR-masked input -> API E.164, e.g. "(11) 99999-9999" -> "+5511999999999". Empty input -> null. */
export function supplierPhoneInputToApi(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const e164 = toE164BR(trimmed);
  return e164 || null;
}

/** Re-exported for the input's own onChange mask — same helper every other BR phone field uses. */
export { formatPhoneInput };
