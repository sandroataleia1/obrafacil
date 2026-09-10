import { formatPhoneInput } from "@/lib/phone";

/**
 * `recipient_phone` from the API is always canonical E.164
 * (`+5511999999999`) — this only affects how it's displayed, the value
 * sent back to the backend is never derived from this (the endpoint
 * doesn't even accept `recipient_phone` in its payload — it's read-only).
 */
export function formatRecipientPhone(e164: string): string {
  const withoutCountryCode = e164.startsWith("+55") ? e164.slice(3) : e164.replace(/^\+/, "");
  return formatPhoneInput(withoutCountryCode);
}
