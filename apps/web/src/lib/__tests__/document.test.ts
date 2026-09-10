import { describe, expect, it } from "vitest";

import { formatCep, formatCnpj, formatCpf, formatCpfCnpj, formatE164PhoneForDisplay, onlyDigits } from "../document";

describe("lib/document", () => {
  /** M1: CPF formatted. */
  it("M1: formatCpf masks progressively as digits arrive", () => {
    expect(formatCpf("11144477735")).toBe("111.444.777-35");
    expect(formatCpf("111")).toBe("111");
    expect(formatCpf("111444")).toBe("111.444");
  });

  /** M2: CNPJ formatted. */
  it("M2: formatCnpj masks progressively as digits arrive", () => {
    expect(formatCnpj("19131243000197")).toBe("19.131.243/0001-97");
    expect(formatCnpj("19")).toBe("19");
    expect(formatCnpj("19131243")).toBe("19.131.243");
  });

  /** M3: CEP formatted. */
  it("M3: formatCep masks as 00000-000", () => {
    expect(formatCep("01001000")).toBe("01001-000");
    expect(formatCep("01001")).toBe("01001");
  });

  /** M4/M5: BR phone display — fixed (10 digits) and mobile (11 digits). */
  it("M4/M5: formatE164PhoneForDisplay handles both fixed and mobile numbers", () => {
    expect(formatE164PhoneForDisplay("+553133334444")).toBe("(31) 3333-4444");
    expect(formatE164PhoneForDisplay("+5531999999999")).toBe("(31) 99999-9999");
  });

  /** M6: E.164 -> display. */
  it("M6: formatE164PhoneForDisplay converts E.164 to the BR display mask", () => {
    expect(formatE164PhoneForDisplay("+5511988887777")).toBe("(11) 98888-7777");
  });

  /** M7: null/empty E.164 input never throws and returns empty string. */
  it("M7: formatE164PhoneForDisplay returns an empty string for null/empty input", () => {
    expect(formatE164PhoneForDisplay(null)).toBe("");
    expect(formatE164PhoneForDisplay(undefined)).toBe("");
    expect(formatE164PhoneForDisplay("")).toBe("");
  });

  /** M8: CNPJ (14 digits) is never truncated to 11 — the core bug this
   * helper exists to avoid (§19: reusing lib/phone's digitsOnly would
   * silently corrupt a CNPJ). */
  it("M8: onlyDigits never truncates a 14-digit CNPJ", () => {
    const cnpjDigits = onlyDigits("19.131.243/0001-97");
    expect(cnpjDigits).toBe("19131243000197");
    expect(cnpjDigits).toHaveLength(14);
  });

  /** M9: CEP formatting never applies phone-shaped grouping. */
  it("M9: formatCep never groups digits like a phone number", () => {
    expect(formatCep("30140110")).toBe("30140-110");
    expect(formatCep("30140110")).not.toContain("(");
  });

  /** M10: empty string input never throws, formats to empty/partial string. */
  it("M10: formatters handle an empty string without throwing", () => {
    expect(formatCpf("")).toBe("");
    expect(formatCnpj("")).toBe("");
    expect(formatCep("")).toBe("");
  });

  /** M11: non-numeric characters are stripped before formatting. */
  it("M11: onlyDigits strips every non-numeric character", () => {
    expect(onlyDigits("111.444.777-35")).toBe("11144477735");
    expect(onlyDigits("abc123def456")).toBe("123456");
  });

  /** formatCpfCnpj dispatches by digit count for display-only contexts. */
  it("formatCpfCnpj dispatches to CPF or CNPJ masking by digit count", () => {
    expect(formatCpfCnpj("11144477735")).toBe("111.444.777-35");
    expect(formatCpfCnpj("19131243000197")).toBe("19.131.243/0001-97");
  });
});
