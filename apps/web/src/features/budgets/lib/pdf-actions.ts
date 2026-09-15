/**
 * PROPOSAL-DOC-01B §31-36: centralizes the two ways a PDF blob reaches
 * the user — "Visualizar" (open in a new tab) and "Baixar" (download) —
 * so both share the exact popup-safe/ObjectURL-lifecycle/tenant-staleness
 * discipline instead of being re-implemented per screen (Detail card,
 * public proposal page).
 *
 * NEVER renders a PDF client-side (§65) — every blob here comes from the
 * backend's canonical renderer via `getBudgetProposalPdf`/
 * `getPublicProposalPdf`; this module only moves bytes into a tab or a
 * download, never builds document content.
 */

import { ApiError, ApiNetworkError } from "@/lib/api-client";

export type PdfActionErrorKind = "not-found" | "rate-limited" | "server" | "network" | "stale" | "unknown";

export interface PdfActionResult {
  ok: boolean;
  error?: PdfActionErrorKind;
}

function classifyPdfError(error: unknown): PdfActionErrorKind {
  if (error instanceof ApiError) {
    if (error.status === 404) return "not-found";
    if (error.status === 429) return "rate-limited";
    return "server";
  }
  if (error instanceof ApiNetworkError) return "network";
  return "unknown";
}

/**
 * §31: opens a blank placeholder tab SYNCHRONOUSLY, inside the click
 * handler, before any `await` — some browsers (notably mobile Safari)
 * block `window.open` once it's no longer directly inside a user
 * gesture's synchronous call stack. Returns `null` when the popup itself
 * was blocked (an ad-blocker, a strict popup setting); the caller falls
 * back to a controlled message rather than silently doing nothing.
 */
export function openPdfPlaceholder(): Window | null {
  return window.open("", "_blank", "noopener,noreferrer");
}

/**
 * §31-32/§35: fetches the PDF and points the already-open placeholder tab
 * at it via a `URL.createObjectURL(blob)`. Must be called with the
 * `Window` `openPdfPlaceholder()` already returned — never opens its own
 * tab (that would be the exact async-`window.open` anti-pattern this is
 * built to avoid).
 *
 * `isStale()` is re-checked both after the fetch resolves/rejects AND
 * (implicitly, by the caller never calling this again) before it starts —
 * a stale response (e.g. the active Company changed while the request was
 * in flight) never navigates the placeholder, never surfaces an error
 * under the new context, and closes the now-orphaned placeholder tab
 * whenever that's still possible (§35).
 */
export async function resolvePdfIntoPlaceholder(
  placeholder: Window | null,
  fetchBlob: () => Promise<Blob>,
  isStale: () => boolean
): Promise<PdfActionResult> {
  let blob: Blob;
  try {
    blob = await fetchBlob();
  } catch (error) {
    if (isStale()) {
      closePlaceholder(placeholder);
      return { ok: false, error: "stale" };
    }
    closePlaceholder(placeholder);
    return { ok: false, error: classifyPdfError(error) };
  }

  if (isStale()) {
    closePlaceholder(placeholder);
    return { ok: false, error: "stale" };
  }

  const url = URL.createObjectURL(blob);
  if (placeholder && !placeholder.closed) {
    placeholder.location.href = url;
  }
  // §32: never revoke immediately — the placeholder tab still needs to
  // load the resource. A minute is generous for even a slow render.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  return { ok: true };
}

function closePlaceholder(placeholder: Window | null): void {
  try {
    placeholder?.close();
  } catch {
    // Some browsers refuse to close a tab not opened by script in this
    // exact way — never let that throw out of an error-handling path.
  }
}

/**
 * §33-34: downloads the PDF via a temporary anchor with `download="..."`.
 * The filename is derived from the Budget's OWN number only (e.g.
 * "ORC-000001.pdf") — never the customer name (§33).
 */
export async function downloadPdfBlob(
  fetchBlob: () => Promise<Blob>,
  filename: string,
  isStale: () => boolean
): Promise<PdfActionResult> {
  let blob: Blob;
  try {
    blob = await fetchBlob();
  } catch (error) {
    if (isStale()) return { ok: false, error: "stale" };
    return { ok: false, error: classifyPdfError(error) };
  }

  if (isStale()) return { ok: false, error: "stale" };

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  return { ok: true };
}

const PDF_ERROR_MESSAGE: Record<PdfActionErrorKind, string> = {
  "not-found": "Orçamento não encontrado.",
  "rate-limited": "Muitas solicitações de PDF. Aguarde um momento e tente novamente.",
  server: "Não foi possível gerar o PDF agora.",
  network: "Não foi possível gerar o PDF agora. Verifique sua conexão.",
  stale: "",
  unknown: "Não foi possível gerar o PDF agora.",
};

export function pdfActionErrorMessage(error: PdfActionErrorKind): string {
  return PDF_ERROR_MESSAGE[error];
}
