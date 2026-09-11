import { describe, expect, it } from "vitest";

import { computeLinePreview, computeOrderPreview, isDiscountWithinSubtotal } from "../money-preview";

describe("money-preview — computeLinePreview", () => {
  it("M1: whole quantity × whole price, no discount", () => {
    const result = computeLinePreview({ quantity: "2.000", unitPrice: "150.00" });
    expect(result.grossLine).toBe("300.00");
    expect(result.lineTotal).toBe("300.00");
  });

  it("M2: fractional quantity that would drift under plain float math (0.1 + 0.2 style repeating decimals)", () => {
    // 1.1 * 10.10 in plain floats: 1.1 * 10.1 = 11.110000000000001 in JS.
    const result = computeLinePreview({ quantity: "1.100", unitPrice: "10.10" });
    expect(result.grossLine).toBe("11.11");
  });

  it("M3: quantity 1/3-style repeating decimal (0.333) rounds half-up at 2 decimals", () => {
    // 0.333 * 3.00 = 0.999 -> rounds to 1.00 (half-up on the exact .999 boundary is not a .5 case,
    // this exercises the truncation-vs-rounding path precisely).
    const result = computeLinePreview({ quantity: "0.333", unitPrice: "3.00" });
    expect(result.grossLine).toBe("1.00");
  });

  it("M4: exact half-cent rounds up (round-half-up, not banker's rounding)", () => {
    // 0.005 * 100 = 0.5 -> half-up rounds to 1 cent -> gross "0.01" from a
    // quantity/price combination that lands exactly on a .5 cent boundary.
    const result = computeLinePreview({ quantity: "0.500", unitPrice: "0.01" });
    expect(result.grossLine).toBe("0.01");
  });

  it("M5: line discount is subtracted from the rounded gross, never from the raw product", () => {
    const result = computeLinePreview({ quantity: "3.000", unitPrice: "33.33", lineDiscount: "10.00" });
    // gross = round(3 * 33.33, 2) = 99.99; line_total = 99.99 - 10.00 = 89.99
    expect(result.grossLine).toBe("99.99");
    expect(result.lineTotal).toBe("89.99");
  });

  it("M6: line discount larger than gross yields a negative line_total (backend's own validation is the real gate — preview mirrors the arithmetic, not the business rule)", () => {
    const result = computeLinePreview({ quantity: "1.000", unitPrice: "10.00", lineDiscount: "50.00" });
    expect(result.lineTotal).toBe("-40.00");
  });

  it("M7: omitted line discount defaults to 0.00", () => {
    const result = computeLinePreview({ quantity: "1.000", unitPrice: "25.00" });
    expect(result.lineTotal).toBe("25.00");
  });

  it("M8: a quantity with 3 decimal places and a price with cents combine without float drift", () => {
    // 12.750 * 8.33 = 106.2075 -> rounds half-up to 106.21 (never 106.20999999999999)
    const result = computeLinePreview({ quantity: "12.750", unitPrice: "8.33" });
    expect(result.grossLine).toBe("106.21");
  });
});

describe("money-preview — computeOrderPreview", () => {
  it("M9: subtotal sums many small line items exactly, without cent drift accumulating", () => {
    // 37 lines of 0.03 each in plain float math can drift by a cent; BigInt cents must not.
    const items = Array.from({ length: 37 }, () => ({ quantity: "1.000", unitPrice: "0.03" }));
    const result = computeOrderPreview({ items });
    expect(result.subtotal).toBe("1.11");
  });

  it("M10: total = subtotal - order_discount + travel_fee", () => {
    const result = computeOrderPreview({
      items: [{ quantity: "2.000", unitPrice: "50.00" }],
      orderDiscount: "10.00",
      travelFee: "25.00",
    });
    expect(result.subtotal).toBe("100.00");
    expect(result.total).toBe("115.00");
  });

  it("M11: an order discount equal to the exact subtotal yields a zero total", () => {
    const result = computeOrderPreview({
      items: [{ quantity: "1.000", unitPrice: "99.99" }],
      orderDiscount: "99.99",
      travelFee: "0.00",
    });
    expect(result.total).toBe("0.00");
  });

  it("M12: zero items yields subtotal 0.00 and total equal to travel fee alone", () => {
    const result = computeOrderPreview({ items: [], travelFee: "35.50" });
    expect(result.subtotal).toBe("0.00");
    expect(result.total).toBe("35.50");
  });

  it("M13: omitted order_discount/travel_fee both default to 0.00", () => {
    const result = computeOrderPreview({ items: [{ quantity: "1.000", unitPrice: "10.00" }] });
    expect(result.total).toBe("10.00");
  });

  it("M14: preserves each line's own result in order alongside the aggregate", () => {
    const result = computeOrderPreview({
      items: [
        { quantity: "1.000", unitPrice: "10.00" },
        { quantity: "2.000", unitPrice: "5.50" },
      ],
    });
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]!.lineTotal).toBe("10.00");
    expect(result.lines[1]!.lineTotal).toBe("11.00");
    expect(result.subtotal).toBe("21.00");
  });
});

describe("money-preview — isDiscountWithinSubtotal", () => {
  it("M15: a discount below the subtotal is within range", () => {
    expect(isDiscountWithinSubtotal("50.00", "100.00")).toBe(true);
  });

  it("M16: a discount exactly equal to the subtotal is within range (boundary, not strict)", () => {
    expect(isDiscountWithinSubtotal("100.00", "100.00")).toBe(true);
  });

  it("M17: a discount above the subtotal is rejected", () => {
    expect(isDiscountWithinSubtotal("100.01", "100.00")).toBe(false);
  });

  it("M18: malformed input never throws — treated as not-within-range", () => {
    expect(isDiscountWithinSubtotal("abc", "100.00")).toBe(false);
  });
});
