import { useEffect, useLayoutEffect } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * SUPPLY-FRONTEND-01A1 §14. Duplicated (not refactored) from
 * `features/projects/__tests__/use-all-projects.test.tsx`'s
 * "useLayoutEffect ref ordering (shared proof, reused from
 * PROPOSAL-DOC-01B1)" describe block — the exact same mechanical proof,
 * reused here as the concrete justification for the `activeCompanyIdRef`/
 * `idRef` pattern this round applied to `MaterialList`/`SupplierList`'s
 * delete dialogs and `MaterialDetail`/`SupplierDetail`'s toggle mutation.
 * RTL's `rerender()` flushes both layout and passive effects
 * synchronously, so the behavioral race tests elsewhere in this round
 * prove the end-to-end fix but not, by themselves, that a `useEffect`
 * (passive) ref-write would have been too late for a promise
 * continuation racing against it — only this harness proves that.
 */
describe("useLayoutEffect ref ordering (shared proof, reused from PROPOSAL-DOC-01B1 / FRONTEND-PROJECTS-01A)", () => {
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
    expect(observedDuringLayout[0]).toBe("company-a");
  });
});
