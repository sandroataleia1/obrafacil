import { describe, expect, it } from "vitest";

import { purchaseDecimalApiToInput, purchaseQuantityInputToApi, purchaseUnitPriceInputToApi } from "../purchase-decimal";

/**
 * SUPPLY-FRONTEND-01C §17-18. `PurchaseOrderItem.quantity`/
 * `GoodsReceiptItem.quantity` are decimal strings at scale 3, `gt:0`.
 * `unit_price` is a decimal string at scale 2, `min:0` (zero allowed).
 * Mirrors `requirement-quantity.test.ts` exactly.
 */
describe("purchase-decimal — SUPPLY-FRONTEND-01C", () => {
  it("a plain integer quantity is accepted", () => {
    expect(purchaseQuantityInputToApi("1")).toBe("1");
  });

  it("a comma decimal quantity is canonicalized to a dot", () => {
    expect(purchaseQuantityInputToApi("1,2")).toBe("1.2");
  });

  it("a 3-decimal comma or dot quantity is canonicalized without loss", () => {
    expect(purchaseQuantityInputToApi("1,250")).toBe("1.250");
    expect(purchaseQuantityInputToApi("1.250")).toBe("1.250");
  });

  it("zero quantity is rejected (gt:0)", () => {
    expect(purchaseQuantityInputToApi("0")).toBeNull();
    expect(purchaseQuantityInputToApi("0,000")).toBeNull();
  });

  it("negative quantity is rejected", () => {
    expect(purchaseQuantityInputToApi("-1")).toBeNull();
  });

  it("scientific notation and more than 3 decimals are rejected for quantity", () => {
    expect(purchaseQuantityInputToApi("1e5")).toBeNull();
    expect(purchaseQuantityInputToApi("1,2345")).toBeNull();
  });

  it("rejects empty/garbage quantity input", () => {
    expect(purchaseQuantityInputToApi("")).toBeNull();
    expect(purchaseQuantityInputToApi("   ")).toBeNull();
    expect(purchaseQuantityInputToApi("abc")).toBeNull();
  });

  it("a plain integer unit price is accepted", () => {
    expect(purchaseUnitPriceInputToApi("18")).toBe("18");
  });

  it("a 2-decimal comma unit price is canonicalized", () => {
    expect(purchaseUnitPriceInputToApi("18,50")).toBe("18.50");
  });

  it("zero unit price IS allowed (min:0, a free/no-charge line)", () => {
    expect(purchaseUnitPriceInputToApi("0")).toBe("0");
    expect(purchaseUnitPriceInputToApi("0,00")).toBe("0.00");
  });

  it("negative unit price is rejected", () => {
    expect(purchaseUnitPriceInputToApi("-1")).toBeNull();
  });

  it("more than 2 decimals is rejected for unit price", () => {
    expect(purchaseUnitPriceInputToApi("18,505")).toBeNull();
  });

  it("purchaseDecimalApiToInput preserves full scale via pure string substitution", () => {
    expect(purchaseDecimalApiToInput("1.250")).toBe("1,250");
    expect(purchaseDecimalApiToInput("18.50")).toBe("18,50");
    expect(purchaseDecimalApiToInput("5")).toBe("5");
  });
});
