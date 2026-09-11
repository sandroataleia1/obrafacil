import { describe, expect, it } from "vitest";

import {
  brlInputToDecimalString,
  decimalStringToBrlDisplay,
  decimalStringToMoneyInputValue,
  formatCurrency,
} from "../currency";

describe("lib/currency — money contract (M1-M10)", () => {
  /** M8: an empty field always becomes null. */
  it("M8: empty string becomes null", () => {
    expect(brlInputToDecimalString("")).toBeNull();
  });

  /** M7: "0" always becomes the decimal string "0.00" — payload is always a string. */
  it("M7: \"0\" becomes \"0.00\"", () => {
    expect(brlInputToDecimalString("0")).toBe("0.00");
  });

  /** M6: centavos-only input. */
  it("M6: \"0,01\" becomes \"0.01\"", () => {
    expect(brlInputToDecimalString("0,01")).toBe("0.01");
  });

  /** M4: a single decimal digit is padded to two. */
  it("M4: \"18,5\" becomes \"18.50\"", () => {
    expect(brlInputToDecimalString("18,5")).toBe("18.50");
  });

  it("\"18,50\" becomes \"18.50\"", () => {
    expect(brlInputToDecimalString("18,50")).toBe("18.50");
  });

  /** M5: thousands separator + decimal comma. */
  it("M5: \"1.234,56\" becomes \"1234.56\"", () => {
    expect(brlInputToDecimalString("1.234,56")).toBe("1234.56");
  });

  it("\"999999,99\" becomes \"999999.99\" (upper bound matching the DB's decimal(14,2))", () => {
    expect(brlInputToDecimalString("999999,99")).toBe("999999.99");
  });

  /** M9: a negative amount is rejected locally (never produces a string to submit). */
  it("M9: a negative amount is rejected locally", () => {
    expect(brlInputToDecimalString("-18,50")).toBeNull();
  });

  it("a bare \"R$\" prefix is tolerated", () => {
    expect(brlInputToDecimalString("R$ 1.234,56")).toBe("1234.56");
  });

  /** M10: roundtrip — "18.50" from the API displays, then re-parses to the exact same string. */
  it("M10: roundtrip \"18.50\" -> display -> re-parsed decimal string is unchanged", () => {
    const display = decimalStringToBrlDisplay("18.50");
    expect(display).toBe(formatCurrency(18.5));
    const reparsed = brlInputToDecimalString(display!.replace("R$", "").trim());
    expect(reparsed).toBe("18.50");
  });

  /** M1: decimal string display. */
  it("M1: decimalStringToBrlDisplay renders a BRL string", () => {
    expect(decimalStringToBrlDisplay("1234.56")).toBe(formatCurrency(1234.56));
  });

  /** M2: null never becomes a fabricated zero. */
  it("M2: null never becomes R$ 0,00", () => {
    expect(decimalStringToBrlDisplay(null)).toBeNull();
  });

  /** M3: a real "0.00" from the API does display as R$ 0,00. */
  it("M3: \"0.00\" displays as R$ 0,00, distinct from null", () => {
    expect(decimalStringToBrlDisplay("0.00")).toBe(formatCurrency(0));
    expect(decimalStringToBrlDisplay("0.00")).not.toBeNull();
  });

  /** decimalStringToMoneyInputValue never duplicates the "R$" MoneyField already renders as a fixed prefix. */
  it("decimalStringToMoneyInputValue strips the R$ prefix for pre-filling a MoneyField", () => {
    expect(decimalStringToMoneyInputValue("18.50")).toBe("18,50");
    expect(decimalStringToMoneyInputValue(null)).toBe("");
  });
});
