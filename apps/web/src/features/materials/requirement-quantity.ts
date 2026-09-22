/**
 * SUPPLY-FRONTEND-01B §6/§19/§30. `MaterialRequirement.required_quantity`
 * is a decimal STRING at scale 3 on the wire (`StoreMaterialRequirementRequest`
 * validates `numeric|gt:0|regex:/^\d+(\.\d{1,3})?$/`) — this module is the
 * only place a BR-typed input crosses into that canonical string.
 *
 * Deliberately does NOT reuse `lib/quantity.ts#quantityInputToDecimalString`
 * — that helper TRUNCATES beyond 3 decimals (`.slice(0, 3)`) instead of
 * rejecting, which is correct for its own callers but violates this
 * gate's explicit "reject client-side: ... mais de 3 casas" requirement.
 */

/**
 * BR-typed input ("1", "1,2", "1,250", "1.250") -> canonical API decimal
 * string ("1", "1.2", "1.250"). Rejects (returns `null`): empty, zero,
 * negative, NaN/Infinity, scientific notation, more than 3 decimal
 * places, or anything containing a character outside `[0-9,.]`. Never
 * uses a JS `float` as the payload's authority — the canonical string is
 * built by pure text manipulation, only ever parsed to `Number` for the
 * final `> 0` check.
 */
export function requirementQuantityInputToApi(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^[\d.,]+$/.test(trimmed)) return null;

  let normalized = trimmed;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) return null;

  const [integerPartRaw, fractionPart] = normalized.split(".");
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, "");
  const canonical = fractionPart ? `${integerPart}.${fractionPart}` : integerPart;

  const value = Number(canonical);
  if (!Number.isFinite(value) || value <= 0) return null;
  return canonical;
}

/**
 * Canonical API decimal string ("1.250") -> BR-typed editable input value
 * ("1,250"). Pure string substitution — never rounds, never drops a
 * trailing zero, so re-opening an edit form never silently changes the
 * stored scale before the user has touched anything.
 */
export function requirementQuantityApiToInput(value: string): string {
  return value.replace(".", ",");
}
