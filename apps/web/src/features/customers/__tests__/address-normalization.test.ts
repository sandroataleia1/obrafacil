import { describe, expect, it } from "vitest";

import { EMPTY_ADDRESS_FIELDS } from "../address-fields";
import { normalizeAddressDrafts, resolveAddressFieldErrors, type AddressDraft } from "../address-normalization";

function emptyPrimaryDraft(clientId: string): AddressDraft {
  return { ...EMPTY_ADDRESS_FIELDS, clientId, is_primary: true, label: "Endereço principal", defaultLabel: "Endereço principal" };
}

function emptySecondaryDraft(clientId: string): AddressDraft {
  return { ...EMPTY_ADDRESS_FIELDS, clientId, is_primary: false, defaultLabel: "" };
}

function filledDraft(clientId: string, overrides: Partial<AddressDraft> = {}): AddressDraft {
  return {
    ...EMPTY_ADDRESS_FIELDS,
    clientId,
    is_primary: false,
    defaultLabel: "",
    city: "Cidade Exemplo",
    ...overrides,
  };
}

describe("normalizeAddressDrafts", () => {
  it("AN1: a lone empty primary draft normalizes to an empty list", () => {
    const drafts = [emptyPrimaryDraft("p1")];
    expect(normalizeAddressDrafts(drafts)).toEqual([]);
  });

  it("AN2: a filled primary draft becomes payload index 0 with is_primary true", () => {
    const drafts = [filledDraft("p1", { is_primary: true, city: "Belo Horizonte" })];
    const normalized = normalizeAddressDrafts(drafts);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]!.payloadIndex).toBe(0);
    expect(normalized[0]!.payload.city).toBe("Belo Horizonte");
    expect(normalized[0]!.payload.is_primary).toBe(true);
  });

  it("AN3: an empty primary + a filled secondary promotes the secondary to payload index 0, primary=true", () => {
    const drafts = [emptyPrimaryDraft("p1"), filledDraft("s1", { city: "Vitória" })];
    const normalized = normalizeAddressDrafts(drafts);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]!.clientId).toBe("s1");
    expect(normalized[0]!.payloadIndex).toBe(0);
    expect(normalized[0]!.payload.is_primary).toBe(true);
    expect(normalized[0]!.payload.city).toBe("Vitória");
  });

  it("AN4: the AN3 scenario's normalized item IS what review must render as Principal", () => {
    const drafts = [emptyPrimaryDraft("p1"), filledDraft("s1", { city: "Vitória" })];
    const normalized = normalizeAddressDrafts(drafts);
    // Review renders directly off `normalized` — this asserts there's
    // exactly one entry and it's flagged primary, which is what a review
    // loop over `normalized` would show as "Principal".
    expect(normalized).toHaveLength(1);
    expect(normalized[0]!.payload.is_primary).toBe(true);
  });

  it("AN5: addresses.0.city maps to the secondary's clientId when the primary draft was empty", () => {
    const drafts = [emptyPrimaryDraft("p1"), filledDraft("s1", { city: "Vitória" })];
    const normalized = normalizeAddressDrafts(drafts);
    const errors = resolveAddressFieldErrors({ "addresses.0.city": ["Cidade inválida."] }, normalized);
    expect(errors).toEqual({ s1: "Cidade inválida." });
  });

  it("AN6: an empty draft sandwiched between two meaningful drafts doesn't shift the mapping", () => {
    const drafts = [filledDraft("a", { city: "Recife", is_primary: true }), emptySecondaryDraft("b"), filledDraft("c", { city: "Salvador" })];
    const normalized = normalizeAddressDrafts(drafts);
    expect(normalized).toHaveLength(2);
    expect(normalized[0]!.clientId).toBe("a");
    expect(normalized[1]!.clientId).toBe("c");
    const errors = resolveAddressFieldErrors({ "addresses.1.city": ["Cidade inválida."] }, normalized);
    expect(errors).toEqual({ c: "Cidade inválida." });
  });

  it("AN7: two meaningful drafts, the second explicitly primary, stays primary", () => {
    const drafts = [filledDraft("a", { city: "Recife" }), filledDraft("b", { city: "Salvador", is_primary: true })];
    const normalized = normalizeAddressDrafts(drafts);
    const primaries = normalized.filter((item) => item.payload.is_primary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]!.clientId).toBe("b");
  });

  it("AN8: exactly one is_primary=true in the payload regardless of input shape", () => {
    const drafts = [filledDraft("a", { city: "Recife" }), filledDraft("b", { city: "Salvador" }), filledDraft("c", { city: "Natal" })];
    const normalized = normalizeAddressDrafts(drafts);
    const primaries = normalized.filter((item) => item.payload.is_primary);
    expect(primaries).toHaveLength(1);
  });

  it("AN9: a real (non-primary) secondary draft with no label never falls back to 'Endereço principal'", () => {
    // Two meaningful addresses so the unlabeled one is a genuine
    // secondary, not promoted to effective primary by rule 6.
    const drafts = [filledDraft("a", { city: "Recife", is_primary: true }), filledDraft("b", { city: "Salvador", label: "" })];
    const normalized = normalizeAddressDrafts(drafts);
    const secondary = normalized.find((item) => item.clientId === "b")!;
    expect(secondary.payload.is_primary).toBe(false);
    expect(secondary.payload.label).not.toBe("Endereço principal");
    expect(secondary.payload.label).toBe("Outro endereço");
  });

  it("AN10: the review label and the payload label are always the exact same value", () => {
    const drafts = [
      emptyPrimaryDraft("p1"),
      filledDraft("s1", { city: "Vitória", label: "" }),
      filledDraft("s2", { city: "Serra", label: "Depósito", is_primary: true }),
    ];
    const normalized = normalizeAddressDrafts(drafts);
    // Review renders `item.payload.label` directly — asserting the
    // normalized payload carries the exact wording review will show.
    expect(normalized.map((item) => item.payload.label)).toEqual(["Outro endereço", "Depósito"]);
  });

  it("complex scenario (§15): two empty drafts, an unlabeled meaningful secondary, and an explicit-primary meaningful draft", () => {
    const drafts = [
      emptyPrimaryDraft("draft-0"),
      emptySecondaryDraft("draft-1"),
      filledDraft("draft-2", { city: "Vitória", label: "" }),
      filledDraft("draft-3", { city: "Serra", label: "Depósito", is_primary: true }),
    ];
    const normalized = normalizeAddressDrafts(drafts);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]!.clientId).toBe("draft-2");
    expect(normalized[0]!.payload.city).toBe("Vitória");
    expect(normalized[0]!.payload.is_primary).toBe(false);
    expect(normalized[0]!.payload.label).not.toBe("Endereço principal");

    expect(normalized[1]!.clientId).toBe("draft-3");
    expect(normalized[1]!.payload.city).toBe("Serra");
    expect(normalized[1]!.payload.label).toBe("Depósito");
    expect(normalized[1]!.payload.is_primary).toBe(true);

    const errors = resolveAddressFieldErrors({ "addresses.1.city": ["Cidade inválida."] }, normalized);
    expect(errors).toEqual({ "draft-3": "Cidade inválida." });
  });
});
