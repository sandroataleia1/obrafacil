/**
 * Lightweight BR phone formatting — no mask library. Accepts free typing
 * and normalizes on display; keeps only digits internally so a future
 * WhatsApp/Evolution API integration can build a normalized number from it.
 */

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 11);
}

export function formatPhoneInput(raw: string): string {
  const digits = digitsOnly(raw);

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
