import { describe, expect, it } from "vitest";

import {
  requirementQuantityApiToInput,
  requirementQuantityForLegacyPlanning,
  requirementQuantityInputToApi,
} from "../requirement-quantity";

/**
 * SUPPLY-FRONTEND-01B §6/§19/§30/§51 (Q1-Q6). `required_quantity` is a
 * decimal string, scale 3, `gt:0` — these prove the BR-input parser
 * matches that contract exactly and REJECTS (never truncates) anything
 * outside it.
 */
describe("requirement-quantity — SUPPLY-FRONTEND-01B §51 (Q1-Q6)", () => {
  it("Q1: a plain integer is accepted", () => {
    expect(requirementQuantityInputToApi("1")).toBe("1");
  });

  it("Q2: a comma decimal is canonicalized to a dot", () => {
    expect(requirementQuantityInputToApi("1,2")).toBe("1.2");
  });

  it("Q3: a 3-decimal comma or dot value is canonicalized without loss", () => {
    expect(requirementQuantityInputToApi("1,250")).toBe("1.250");
    expect(requirementQuantityInputToApi("1.250")).toBe("1.250");
  });

  it("Q4: zero is rejected", () => {
    expect(requirementQuantityInputToApi("0")).toBeNull();
    expect(requirementQuantityInputToApi("0,000")).toBeNull();
  });

  it("Q5: negative is rejected", () => {
    expect(requirementQuantityInputToApi("-1")).toBeNull();
  });

  it("Q6: scientific notation and more than 3 decimals are rejected", () => {
    expect(requirementQuantityInputToApi("1e5")).toBeNull();
    expect(requirementQuantityInputToApi("1,2345")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(requirementQuantityInputToApi("")).toBeNull();
    expect(requirementQuantityInputToApi("   ")).toBeNull();
  });

  it("rejects NaN/garbage input", () => {
    expect(requirementQuantityInputToApi("abc")).toBeNull();
    expect(requirementQuantityInputToApi("Infinity")).toBeNull();
  });

  it("strips a leading zero without losing the fraction", () => {
    expect(requirementQuantityInputToApi("01,5")).toBe("1.5");
  });

  it("requirementQuantityApiToInput preserves full scale via pure string substitution", () => {
    expect(requirementQuantityApiToInput("1.250")).toBe("1,250");
    expect(requirementQuantityApiToInput("2.500")).toBe("2,500");
    expect(requirementQuantityApiToInput("5")).toBe("5");
  });

  it("requirementQuantityForLegacyPlanning is a transient number bridge only", () => {
    expect(requirementQuantityForLegacyPlanning("1.250")).toBe(1.25);
    expect(requirementQuantityForLegacyPlanning("8.5")).toBe(8.5);
  });
});
