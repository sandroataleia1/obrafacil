import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useAddedToBudget } from "../use-added-to-budget";

describe("useAddedToBudget (FRONTEND-BUDGETS-01A1 §16-18)", () => {
  it("starts false", () => {
    const { result } = renderHook(() => useAddedToBudget("company-a"));
    expect(result.current[0]).toBe(false);
  });

  it("can be flipped to true and stays true across re-renders with the SAME company", () => {
    const { result, rerender } = renderHook(({ companyId }) => useAddedToBudget(companyId), {
      initialProps: { companyId: "company-a" },
    });

    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);

    rerender({ companyId: "company-a" });
    expect(result.current[0]).toBe(true);
  });

  /** §16-17: switching companyId resets the flag — the technical result stays, only ownership resets. */
  it("resets to false the instant companyId changes", () => {
    const { result, rerender } = renderHook(({ companyId }) => useAddedToBudget(companyId), {
      initialProps: { companyId: "company-a" as string | undefined },
    });

    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);

    rerender({ companyId: "company-b" });
    expect(result.current[0]).toBe(false);
  });

  /** §18: losing the active company entirely (undefined) also resets. */
  it("resets to false when companyId becomes undefined", () => {
    const { result, rerender } = renderHook(({ companyId }) => useAddedToBudget(companyId), {
      initialProps: { companyId: "company-a" as string | undefined },
    });

    act(() => result.current[1](true));
    rerender({ companyId: undefined });
    expect(result.current[0]).toBe(false);
  });

  it("does not reset on a re-render that keeps the same companyId reference/value", () => {
    const { result, rerender } = renderHook(({ companyId }) => useAddedToBudget(companyId), {
      initialProps: { companyId: "company-a" },
    });

    act(() => result.current[1](true));
    rerender({ companyId: "company-a" });
    rerender({ companyId: "company-a" });
    expect(result.current[0]).toBe(true);
  });
});
