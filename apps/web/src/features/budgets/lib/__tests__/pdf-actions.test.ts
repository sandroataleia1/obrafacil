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

  /** PB2: the placeholder tab is opened synchronously via window.open, before any fetch. */
  it("PB2: openPdfPlaceholder calls window.open synchronously with a blank placeholder", () => {
    const openSpy = vi.fn().mockReturnValue(fakeWindow());
    vi.stubGlobal("window", { open: openSpy });

    openPdfPlaceholder();

    expect(openSpy).toHaveBeenCalledWith("", "_blank", "noopener,noreferrer");
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
});
