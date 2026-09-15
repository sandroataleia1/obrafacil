import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, ApiNetworkError } from "@/lib/api-client";
import {
  downloadPdfBlob,
  openPdfPlaceholder,
  resolvePdfIntoPlaceholder,
} from "../pdf-actions";

function fakeBlob(): Blob {
  return new Blob(["%PDF-fake"], { type: "application/pdf" });
}

function fakeWindow(): Window {
  return {
    closed: false,
    location: { href: "" },
    close: vi.fn(),
    opener: {},
  } as unknown as Window;
}

describe("pdf-actions", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:fake-url"), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** PB1: a successful resolution creates an object URL from the fetched blob. */
  it("PB1: open creates an object URL from the fetched blob", async () => {
    const placeholder = fakeWindow();
    await resolvePdfIntoPlaceholder(placeholder, async () => fakeBlob(), () => false);

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  /**
   * PB2 (PROPOSAL-DOC-01B1 §7): corrected — this no longer merely checks
   * that `window.open("", "_blank", "noopener,noreferrer")` "returns
   * whatever the mock decided to return". It proves OUR actual contract:
   * `window.open` is called WITHOUT a `noopener`/`noreferrer` windowFeatures
   * string (which is legally permitted to return `null` even on success —
   * exactly the incompatibility this microgate fixes), and the handle
   * `openPdfPlaceholder()` returns is the SAME object `window.open` gave
   * back (so it stays usable for the later `placeholder.location.href`
   * navigation in `resolvePdfIntoPlaceholder`).
   */
  it("PB2: openPdfPlaceholder calls window.open without a noopener windowFeatures string, and returns window.open's own handle", () => {
    const handle = fakeWindow();
    const openSpy = vi.fn().mockReturnValue(handle);
    vi.stubGlobal("window", { open: openSpy });

    const result = openPdfPlaceholder();

    expect(openSpy).toHaveBeenCalledWith("", "_blank");
    const call = openSpy.mock.calls[0]!;
    expect(call).not.toContain("noopener");
    expect(call).not.toContain("noopener,noreferrer");
    expect(result).toBe(handle);
  });

  /** PB3: on success, the placeholder navigates to the created object URL. */
  it("PB3: success navigates the placeholder to the blob URL", async () => {
    const placeholder = fakeWindow();
    const result = await resolvePdfIntoPlaceholder(placeholder, async () => fakeBlob(), () => false);

    expect(result.ok).toBe(true);
    expect(placeholder.location.href).toBe("blob:fake-url");
  });

  /** PB4: a fetch failure closes the placeholder and reports a classified error. */
  it("PB4: failure closes the placeholder and classifies the error", async () => {
    const placeholder = fakeWindow();
    const result = await resolvePdfIntoPlaceholder(
      placeholder,
      async () => {
        throw new ApiError(500, "boom");
      },
      () => false
    );

    expect(placeholder.close).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, error: "server" });
    expect(placeholder.location.href).toBe("");
  });

  /** PB5: a stale response (tenant/budget changed mid-flight) closes the placeholder and never navigates it. */
  it("PB5: a stale response closes the placeholder without navigating it", async () => {
    const placeholder = fakeWindow();
    const result = await resolvePdfIntoPlaceholder(placeholder, async () => fakeBlob(), () => true);

    expect(placeholder.close).toHaveBeenCalledTimes(1);
    expect(placeholder.location.href).toBe("");
    expect(result).toEqual({ ok: false, error: "stale" });
  });

  /** PB6: a download uses an anchor with the exact expected filename, derived from the Budget number only. */
  it("PB6: download creates an anchor with the correct filename", async () => {
    const clickSpy = vi.fn();
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    await downloadPdfBlob(async () => fakeBlob(), "ORC-000001.pdf", () => false);

    const anchorCall = appendSpy.mock.calls.find((call) => (call[0] as HTMLElement).tagName === "A");
    expect(anchorCall).toBeDefined();
    const anchor = anchorCall![0] as HTMLAnchorElement;
    expect(anchor.download).toBe("ORC-000001.pdf");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  /** PB7: download revokes the object URL after a safe delay, never immediately (so the browser has time to consume it). */
  it("PB7: download revokes the object URL after a safe delay, not immediately", async () => {
    vi.useFakeTimers();
    const result = await downloadPdfBlob(async () => fakeBlob(), "ORC-000001.pdf", () => false);

    expect(result.ok).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });

  /** PB8: a network failure during download is classified distinctly and never treated as a stale/server error. */
  it("PB8: a network failure during download is classified as network, not server", async () => {
    const result = await downloadPdfBlob(
      async () => {
        throw new ApiNetworkError();
      },
      "ORC-000001.pdf",
      () => false
    );

    expect(result).toEqual({ ok: false, error: "network" });
  });

  // ================= PP1-PP8 (PROPOSAL-DOC-01B1 §19) — real popup semantics =================

  /** PP1: openPdfPlaceholder returns a usable WindowProxy handle — the same one window.open gave back. */
  it("PP1: open returns a usable WindowProxy handle", () => {
    const handle = fakeWindow();
    const openSpy = vi.fn().mockReturnValue(handle);
    vi.stubGlobal("window", { open: openSpy });

    const result = openPdfPlaceholder();

    expect(result).not.toBeNull();
    expect(result).toBe(handle);
  });

  /** PP2: opener is anulled on the handle when possible. */
  it("PP2: opener is nulled out on the returned handle", () => {
    const handle = fakeWindow();
    vi.stubGlobal("window", { open: vi.fn().mockReturnValue(handle) });

    openPdfPlaceholder();

    expect(handle.opener).toBeNull();
  });

  /** PP2b: a handle where `opener` assignment throws (read-only in some browsers) is still returned usable, never swallowed into null. */
  it("PP2b: a handle whose opener assignment throws is still returned as a usable handle", () => {
    const handle = fakeWindow();
    Object.defineProperty(handle, "opener", {
      set() {
        throw new Error("opener is read-only in this environment");
      },
      get() {
        return {};
      },
    });
    vi.stubGlobal("window", { open: vi.fn().mockReturnValue(handle) });

    const result = openPdfPlaceholder();

    expect(result).toBe(handle);
  });

  /** PP3: window.open is never called with a noopener/noreferrer windowFeatures string, which would legally permit a null return even on success. */
  it("PP3: window.open is never called with noopener windowFeatures", () => {
    const openSpy = vi.fn().mockReturnValue(fakeWindow());
    vi.stubGlobal("window", { open: openSpy });

    openPdfPlaceholder();

    const args = openSpy.mock.calls[0]!;
    expect(args).toHaveLength(2);
    expect(args[0]).toBe("");
    expect(args[1]).toBe("_blank");
  });

  /** PP4: a genuinely blocked popup (window.open returns null) is reported as "popup-blocked". */
  it("PP4: a null placeholder resolves to popup-blocked", async () => {
    const result = await resolvePdfIntoPlaceholder(null, async () => fakeBlob(), () => false);

    expect(result).toEqual({ ok: false, error: "popup-blocked" });
  });

  /** PP5: a blocked popup never triggers a PDF fetch. */
  it("PP5: a null placeholder never calls fetchBlob", async () => {
    const fetchBlob = vi.fn(async () => fakeBlob());

    await resolvePdfIntoPlaceholder(null, fetchBlob, () => false);

    expect(fetchBlob).not.toHaveBeenCalled();
  });

  /** PP6: a blocked popup never creates an ObjectURL. */
  it("PP6: a null placeholder never creates an ObjectURL", async () => {
    await resolvePdfIntoPlaceholder(null, async () => fakeBlob(), () => false);

    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  /** PP7/PP8: the popup-blocked message is the exact friendly copy shown in both Budget Detail and the public Proposal page. */
  it("PP7/PP8: pdfActionErrorMessage('popup-blocked') is the exact friendly copy", async () => {
    const { pdfActionErrorMessage } = await import("../pdf-actions");
    expect(pdfActionErrorMessage("popup-blocked")).toBe(
      "Não foi possível abrir uma nova aba. Permita pop-ups para visualizar o PDF ou use Baixar PDF."
    );
  });

  /** Object URL leak guard: a navigation failure after the ObjectURL was created still revokes it, never leaving it dangling. */
  it("a navigation failure after ObjectURL creation revokes it immediately, not after the 60s timeout", async () => {
    const placeholder = fakeWindow();
    Object.defineProperty(placeholder, "location", {
      get() {
        return {
          set href(_value: string) {
            throw new Error("cannot navigate a closed/inaccessible window");
          },
        };
      },
    });

    const result = await resolvePdfIntoPlaceholder(placeholder, async () => fakeBlob(), () => false);

    expect(result.ok).toBe(false);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });
});
