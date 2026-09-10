import { digitsOnly } from "@/lib/phone";

/**
 * Converts a BR-masked phone (as typed/displayed via `formatPhoneInput`)
 * into the canonical E.164 form the API requires (`+55` + digits). This is
 * intentionally separate from `lib/phone.ts` — that module is shared by
 * business-domain (Customer) phone fields and stays display/digits-only;
 * this E.164 concern is specific to what the auth API contract demands.
 */
export function toE164BR(raw: string): string {
  const digits = digitsOnly(raw);
  return digits ? `+55${digits}` : "";
}
