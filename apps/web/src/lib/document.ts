/**
 * CPF/CNPJ/CEP formatting helpers. Deliberately separate from
 * `lib/phone.ts`'s `digitsOnly`, which truncates to 11 digits (a BR mobile
 * number with DDD) — reusing that for a 14-digit CNPJ would silently
 * corrupt it. `onlyDigits` here has no length cap.
 */

export function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function formatCpf(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatCnpj(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/** Dispatches by digit count — for display contexts where kind isn't already known. */
export function formatCpfCnpj(raw: string): string {
  const digits = onlyDigits(raw);
  return digits.length > 11 ? formatCnpj(raw) : formatCpf(raw);
}

export function formatCep(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** BR E.164 (+55XXXXXXXXXXX) -> "(31) 99999-9999" display. Returns "" for null/invalid. */
export function formatE164PhoneForDisplay(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.startsWith("+55") ? value.slice(3) : onlyDigits(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
