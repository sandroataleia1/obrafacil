import { describe, expect, it } from "vitest";

import { supplierPhoneApiToInput, supplierPhoneInputMask, supplierPhoneInputToApi } from "../supplier-phone";

/**
 * SUPPLY-FRONTEND-01A §40-42, SF12-SF13. Proves the E.164 <-> BR-masked
 * adapters never mis-slice a `+55`-prefixed string (the exact bug
 * `formatPhoneInput` would introduce if fed E.164 directly).
 */
describe("supplier-phone — SUPPLY-FRONTEND-01A §42", () => {
  it("SF13: +5511999999999 (mobile) -> (11) 99999-9999", () => {
    expect(supplierPhoneApiToInput("+5511999999999")).toBe("(11) 99999-9999");
  });

  it("SF12: (11) 99999-9999 -> +5511999999999", () => {
    expect(supplierPhoneInputToApi("(11) 99999-9999")).toBe("+5511999999999");
  });

  it("SF13: +551133334444 (landline) -> (11) 3333-4444", () => {
    expect(supplierPhoneApiToInput("+551133334444")).toBe("(11) 3333-4444");
  });

  it("empty input -> null", () => {
    expect(supplierPhoneInputToApi("")).toBeNull();
    expect(supplierPhoneInputToApi("   ")).toBeNull();
  });

  it("null API value -> empty display string", () => {
    expect(supplierPhoneApiToInput(null)).toBe("");
  });

  it("round-trips a landline through both directions", () => {
    const input = supplierPhoneApiToInput("+551133334444");
    expect(supplierPhoneInputToApi(input)).toBe("+551133334444");
  });

  /** SUPPLY-FRONTEND-01A1 §25. A pasted E.164 string must not be mis-sliced by the BR-local typing mask. */
  it("supplierPhoneInputMask: pasting +5511999999999 normalizes to (11) 99999-9999", () => {
    expect(supplierPhoneInputMask("+5511999999999")).toBe("(11) 99999-9999");
  });

  it("supplierPhoneInputMask: pasting a bare 5511999999999 (no plus) also normalizes correctly", () => {
    expect(supplierPhoneInputMask("5511999999999")).toBe("(11) 99999-9999");
  });

  it("supplierPhoneInputMask: ordinary BR-local typing still goes through formatPhoneInput unchanged", () => {
    expect(supplierPhoneInputMask("11999999999")).toBe("(11) 99999-9999");
  });
});
