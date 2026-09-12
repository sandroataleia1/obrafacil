import { EMPTY_ADDRESS_FIELDS, type AddressFieldsValue } from "./address-fields";
import type { AddressCreatePayload } from "./types";

export interface AddressDraft extends AddressFieldsValue {
  clientId: string;
  is_primary: boolean;
  /**
   * The label this draft STARTED with. An untouched draft whose label
   * still equals this value contributes no signal of user intent by
   * itself — see `hasMeaningfulAddressData`. The primary draft starts
   * with "Endereço principal"; any other draft starts with "".
   */
  defaultLabel: string;
}

export interface NormalizedAddress {
  draft: AddressDraft;
  clientId: string;
  payloadIndex: number;
  payload: AddressCreatePayload;
}

/**
 * An address draft only counts as "the user actually provided this
 * address" — and therefore ever enters the final payload — if it carries
 * real data beyond its untouched defaults. The primary draft auto-starts
 * with the label "Endereço principal" and the default `type`; neither of
 * those alone signals intent, so the label is compared against whatever
 * THIS draft itself started with (`defaultLabel`), never against a blank
 * string. Any postal/street/number/complement/neighborhood/city/state/
 * reference_point value, a CNPJ-lookup autofill (which writes exactly
 * those same fields), or a label/type the user deliberately changed all
 * count as meaningful. An untouched draft — all defaults, unedited label,
 * unedited type — must never silently become a real address row.
 */
export function hasMeaningfulAddressData(draft: AddressDraft): boolean {
  const textFields = [
    draft.postal_code,
    draft.street,
    draft.number,
    draft.complement,
    draft.neighborhood,
    draft.city,
    draft.state,
    draft.reference_point,
  ];
  if (textFields.some((value) => value.trim() !== "")) return true;
  if (draft.label.trim() !== draft.defaultLabel) return true;
  if (draft.type !== EMPTY_ADDRESS_FIELDS.type) return true;
  return false;
}

/**
 * Label is text; is_primary is structure — never infer one from the
 * other. A blank label falls back to a wording that matches whether
 * THIS address ends up effectively primary, so it's never ambiguous
 * with a real secondary address that happens to also be named "Endereço
 * principal".
 */
function effectiveAddressLabel(draft: AddressDraft, isPrimary: boolean): string {
  const trimmed = draft.label.trim();
  if (trimmed !== "") return trimmed;
  return isPrimary ? "Endereço principal" : "Outro endereço";
}

/**
 * The single source of truth for turning address drafts into what will
 * actually be sent. Review, the final payload, the effective-primary
 * flag and backend addresses.N.* error mapping must ALL read from this
 * same list — never recompute these rules independently.
 *
 * Only meaningful drafts (see `hasMeaningfulAddressData`) appear here,
 * in the order they'll be sent — `payloadIndex` is exactly the index the
 * backend will see in `addresses[]`, which is NOT necessarily the
 * draft's position in the original (unfiltered) drafts array.
 *
 * Effective primary: if some meaningful draft was marked primary,
 * that one wins. If the draft marked primary was itself empty (and so
 * got filtered out), the first meaningful draft is promoted instead —
 * there is always exactly one primary among 1+ meaningful addresses.
 */
export function normalizeAddressDrafts(addresses: AddressDraft[]): NormalizedAddress[] {
  const meaningful = addresses.filter(hasMeaningfulAddressData);
  if (meaningful.length === 0) return [];

  const explicitPrimaryIndex = meaningful.findIndex((draft) => draft.is_primary);
  const effectivePrimaryIndex = explicitPrimaryIndex >= 0 ? explicitPrimaryIndex : 0;

  return meaningful.map((draft, index) => {
    const isPrimary = index === effectivePrimaryIndex;
    const payload: AddressCreatePayload = {
      label: effectiveAddressLabel(draft, isPrimary),
      type: draft.type,
      postal_code: draft.postal_code || null,
      street: draft.street || null,
      number: draft.number || null,
      complement: draft.complement || null,
      neighborhood: draft.neighborhood || null,
      city: draft.city || null,
      state: draft.state || null,
      reference_point: draft.reference_point || null,
      is_primary: isPrimary,
    };
    return { draft, clientId: draft.clientId, payloadIndex: index, payload };
  });
}

/**
 * Resolves backend `addresses.N.*` validation errors against the SAME
 * normalized list used to build the payload — never against the
 * original (unfiltered, possibly differently-ordered) drafts array — so
 * an error for payload index N always lands on the draft that actually
 * occupies that position, even when earlier empty drafts were omitted.
 */
export function resolveAddressFieldErrors(
  errors: Record<string, string[]>,
  normalized: NormalizedAddress[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, messages] of Object.entries(errors)) {
    const match = /^addresses\.(\d+)(?:\.|$)/.exec(key);
    if (!match) continue;
    const index = Number(match[1]);
    const message = messages[0];
    const item = normalized[index];
    if (!item || !message) continue;
    if (!result[item.clientId]) result[item.clientId] = message;
  }
  return result;
}
