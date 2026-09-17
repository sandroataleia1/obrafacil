import { useEffect, useLayoutEffect } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../projects-client", () => ({
  listAllProjectsFromApi: vi.fn(),
}));

import { listAllProjectsFromApi } from "../projects-client";
import { useAllProjects } from "../use-all-projects";
import type { ProjectListItem } from "../types";

function item(id: string, name: string): ProjectListItem {
  return {
    id,
    number: `OBR-${id}`,
    name,
    status: "planning",
    reference: null,
    customer: { id: "cust-1", name: "Cliente" },
    expected_start_date: null,
    expected_end_date: null,
    source_budget: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
}

describe("useAllProjects — FRONTEND-PROJECTS-01A §2-8 (TH1-TH6/TH11/TH12)", () => {
  beforeEach(() => {
    vi.mocked(listAllProjectsFromApi).mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** TH1: Company A loads normally. */
  it("TH1: Company A loads normally", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValue([item("a1", "Obra A1")]);
    const { result } = renderHook(() => useAllProjects());

    await waitFor(() => expect(result.current.projects).toEqual([item("a1", "Obra A1")]));
    expect(result.current.error).toBe(false);
  });

  /**
   * TH2/§5: SAME-RENDER fail-closed — the render that immediately follows
   * switching to Company B must never return Company A's `projects`, even
   * before any GET for B has resolved. This is a synchronous assertion
   * right after `rerender()`, not a `waitFor`/effect-later check.
   */
  it("TH2: the render immediately after switching to Company B never returns Company A's projects", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValueOnce([item("a1", "Obra A1")]).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(() => useAllProjects());
    await waitFor(() => expect(result.current.projects).toEqual([item("a1", "Obra A1")]));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();

    // Synchronous — no await between the switch and this assertion.
    expect(result.current.projects).toBeUndefined();
    expect(result.current.error).toBe(false);
  });

  /**
   * TH3/§6: the EXACT promise race — Company A's request is in flight,
   * the switch to B commits, and A's response resolves in the SAME
   * synchronous block as the switch (before any further `await` gives a
   * passive effect a chance to run). A must never write B's state.
   */
  it("TH3: a late success for Company A resolving in the exact tick after switching to B is discarded", async () => {
    let resolveA!: (value: ProjectListItem[]) => void;
    vi.mocked(listAllProjectsFromApi)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          })
      )
      .mockResolvedValueOnce([item("b1", "Obra B1")]);

    const { result, rerender } = renderHook(() => useAllProjects());
    await waitFor(() => expect(listAllProjectsFromApi).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveA([item("a1", "Obra A1 (stale)")]);

    await waitFor(() => expect(result.current.projects).toEqual([item("b1", "Obra B1")]));
    expect(result.current.projects).not.toContainEqual(item("a1", "Obra A1 (stale)"));
  });

  /** TH4: a late ERROR for Company A resolving after the switch to B is discarded — B never sees A's error. */
  it("TH4: a late error for Company A never marks Company B as errored", async () => {
    let rejectA!: (error: Error) => void;
    vi.mocked(listAllProjectsFromApi)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectA = reject;
          })
      )
      .mockResolvedValueOnce([item("b1", "Obra B1")]);

    const { result, rerender } = renderHook(() => useAllProjects());
    await waitFor(() => expect(listAllProjectsFromApi).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    rejectA(new Error("network"));

    await waitFor(() => expect(result.current.projects).toEqual([item("b1", "Obra B1")]));
    expect(result.current.error).toBe(false);
  });

  /** TH5: Company B genuinely has no Obras — returns [], never confused with an error. */
  it("TH5: a genuinely empty Company returns [], not an error", async () => {
    vi.mocked(listAllProjectsFromApi).mockResolvedValue([]);
    const { result } = renderHook(() => useAllProjects());

    await waitFor(() => expect(result.current.projects).toEqual([]));
    expect(result.current.error).toBe(false);
  });

  /** TH6/§8: a real 500/network failure surfaces as `error: true` — `projects` stays undefined, never collapsed to []. */
  it("TH6: a 500/network failure returns error: true, never projects: []", async () => {
    vi.mocked(listAllProjectsFromApi).mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useAllProjects());

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.projects).toBeUndefined();
  });

  /** TH11/§7: listAllProjectsFromApi pages internally — a switch mid-pagination discards the eventual combined result entirely, never a partial commit. */
  it("TH11: an all-pages request in flight during a Company switch is discarded entirely, never partially applied", async () => {
    let resolveA!: (value: ProjectListItem[]) => void;
    vi.mocked(listAllProjectsFromApi)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          })
      )
      .mockResolvedValueOnce([item("b1", "Obra B1")]);

    const { result, rerender } = renderHook(() => useAllProjects());
    await waitFor(() => expect(listAllProjectsFromApi).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    // Simulates the multi-page helper finally resolving its FULL combined
    // result (both pages) well after the switch committed.
    resolveA([item("a1", "Obra A1 pg1"), item("a2", "Obra A2 pg2")]);

    await waitFor(() => expect(result.current.projects).toEqual([item("b1", "Obra B1")]));
    expect(result.current.projects).toHaveLength(1);
  });

  /** TH12: reload() belongs only to the tenant active when it was called — a stale reload's result is discarded exactly like a stale initial load. */
  it("TH12: reload() started under Company A is discarded if it resolves after switching to B", async () => {
    let resolveReload!: (value: ProjectListItem[]) => void;
    vi.mocked(listAllProjectsFromApi)
      .mockResolvedValueOnce([item("a1", "Obra A1")])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveReload = resolve;
          })
      )
      .mockResolvedValueOnce([item("b1", "Obra B1")]);

    const { result, rerender } = renderHook(() => useAllProjects());
    await waitFor(() => expect(result.current.projects).toEqual([item("a1", "Obra A1")]));

    act(() => result.current.reload());
    await waitFor(() => expect(listAllProjectsFromApi).toHaveBeenCalledTimes(2));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveReload([item("a1", "Obra A1 (stale reload)")]);

    await waitFor(() => expect(result.current.projects).toEqual([item("b1", "Obra B1")]));
  });
});

/**
 * FRONTEND-PROJECTS-01A §26: the same low-level ordering proof already
 * established in `proposal-view.test.tsx` (PROPOSAL-DOC-01B1 §7/§10/§13)
 * — reused here as the justification for EVERY `useLayoutEffect` fix in
 * this round (`useAllProjects`, `useProject`, `useDashboardSummary`,
 * `useExecutivePanel`, `ProjectDetail`, `ProjectList`,
 * `ProjectEditForm`'s wrapper). React Testing Library's `rerender()`
 * flushes BOTH layout and passive effects synchronously before
 * returning, so the TH2-TH4/TH11/TH12 behavioral tests above prove the
 * end-to-end fix but do NOT, by themselves, prove that a `useEffect`
 * (passive) ref-write would have been too late — only that the CURRENT
 * `useLayoutEffect` implementation is correct. This harness isolates the
 * one property that actually matters: within a SINGLE commit, a
 * `useLayoutEffect` write is visible to any layout-phase reader, while a
 * `useEffect` write is not.
 */
describe("useLayoutEffect ref ordering (shared proof, reused from PROPOSAL-DOC-01B1)", () => {
  it("a useLayoutEffect ref-write always commits before a useEffect in the SAME render", () => {
    const log: string[] = [];

    function LayoutWriter({ value }: { value: string }) {
      useLayoutEffect(() => {
        log.push(`layout:${value}`);
      }, [value]);
      return null;
    }

    function PassiveReader({ value }: { value: string }) {
      useEffect(() => {
        log.push(`passive:${value}`);
      }, [value]);
      return null;
    }

    function Harness({ value }: { value: string }) {
      return (
        <>
          <LayoutWriter value={value} />
          <PassiveReader value={value} />
        </>
      );
    }

    const { rerender } = render(<Harness value="company-a" />);
    expect(log).toEqual(["layout:company-a", "passive:company-a"]);

    log.length = 0;
    rerender(<Harness value="company-b" />);
    expect(log).toEqual(["layout:company-b", "passive:company-b"]);
  });

  it("a useEffect-based ref write would NOT yet be visible to a layout-phase consumer in the SAME commit (the pre-fix hazard)", () => {
    const observedDuringLayout: (string | undefined)[] = [];

    function EffectWriter({ value, refObj }: { value: string; refObj: { current: string | undefined } }) {
      useEffect(() => {
        refObj.current = value;
      }, [value, refObj]);
      return null;
    }

    function LayoutObserver({ refObj }: { refObj: { current: string | undefined } }) {
      useLayoutEffect(() => {
        observedDuringLayout.push(refObj.current);
      });
      return null;
    }

    const refObj: { current: string | undefined } = { current: undefined };
    const { rerender } = render(
      <>
        <EffectWriter value="company-a" refObj={refObj} />
        <LayoutObserver refObj={refObj} />
      </>
    );
    expect(observedDuringLayout[0]).toBeUndefined();

    observedDuringLayout.length = 0;
    rerender(
      <>
        <EffectWriter value="company-b" refObj={refObj} />
        <LayoutObserver refObj={refObj} />
      </>
    );
    // The layout-phase consumer still sees the OLD company id — exactly
    // the stale read a `useEffect`-based `activeCompanyIdRef` would have
    // produced for a promise continuation racing against it.
    expect(observedDuringLayout[0]).toBe("company-a");
  });
});
