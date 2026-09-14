"use client";

/**
 * Public "Proposta" screen — GET/POST /api/v1/proposals/{token}. No auth,
 * no CurrentCompany/tenant context, no localStorage/sessionStorage: this
 * page must render correctly in a fully logged-out browser (it is normally
 * opened from a WhatsApp link on a phone). Only ever reads the fields on
 * `PublicProposal`/`PublicProposalItem` — never any internal/cost/tenant
 * field (those don't even exist on this contract; see `types.ts`).
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { getPublicProposal, approvePublicProposal, rejectPublicProposal } from "./proposal-client";
import type { PublicProposal } from "./types";

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | { status: "loaded"; proposal: PublicProposal };

const RATE_LIMIT_MESSAGE = "Muitas tentativas. Aguarde um momento e tente novamente.";
const GENERIC_DECISION_ERROR = "Não foi possível registrar sua decisão agora. Tente novamente.";

/**
 * Quantity is a decimal STRING from the API ("1.000", "1.500") — this is a
 * display-only trim/rounding transform, never used as the source of truth
 * (quantity isn't money, so `Number()` here is safe; the same is never done
 * for a money field in this file).
 */
function formatQuantityDisplay(raw: string): string {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;
  const trimmed = numeric.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return (trimmed === "" ? "0" : trimmed).replace(".", ",");
}

/** String-based zero check for a decimal amount — never routes through `Number()`. */
function isZeroDecimalString(value: string): boolean {
  return /^0+(\.0+)?$/.test(value.trim());
}

function formatDecidedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function ProposalView({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const proposal = await getPublicProposal(token);
      setState({ status: "loaded", proposal });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setState({ status: "not-found" });
        return;
      }
      setState({ status: "error" });
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleDecisionError(err: unknown) {
    if (err instanceof ApiError && err.status === 409) {
      // Someone else already decided (e.g. a second open tab) — never
      // retry the original action; show whichever state actually won.
      try {
        const fresh = await getPublicProposal(token);
        setState({ status: "loaded", proposal: fresh });
        setConfirmingReject(false);
        setDecisionError(null);
      } catch {
        setDecisionError(GENERIC_DECISION_ERROR);
      }
      return;
    }

    if (err instanceof ApiError && err.status === 429) {
      setDecisionError(RATE_LIMIT_MESSAGE);
      return;
    }

    setDecisionError(GENERIC_DECISION_ERROR);
  }

  async function handleApprove() {
    const trimmedName = name.trim();
    if (trimmedName === "") {
      setNameError("Informe seu nome.");
      return;
    }
    setNameError(null);
    setDecisionError(null);
    setDeciding(true);
    try {
      const updated = await approvePublicProposal(token, {
        name: trimmedName,
        accepted: true,
        note: note.trim() === "" ? null : note.trim(),
      });
      setState({ status: "loaded", proposal: updated });
      setConfirmingReject(false);
    } catch (err) {
      await handleDecisionError(err);
    } finally {
      setDeciding(false);
    }
  }

  function handleRejectStart() {
    const trimmedName = name.trim();
    if (trimmedName === "") {
      setNameError("Informe seu nome.");
      return;
    }
    setNameError(null);
    setDecisionError(null);
    setConfirmingReject(true);
  }

  async function handleRejectConfirm() {
    const trimmedName = name.trim();
    if (trimmedName === "") {
      setNameError("Informe seu nome.");
      setConfirmingReject(false);
      return;
    }
    setNameError(null);
    setDecisionError(null);
    setDeciding(true);
    try {
      const updated = await rejectPublicProposal(token, {
        name: trimmedName,
        note: note.trim() === "" ? null : note.trim(),
      });
      setState({ status: "loaded", proposal: updated });
      setConfirmingReject(false);
    } catch (err) {
      await handleDecisionError(err);
    } finally {
      setDeciding(false);
    }
  }

  if (state.status === "loading") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6" role="status">
        <p className="text-sm text-muted-foreground">Carregando proposta...</p>
      </main>
    );
  }

  if (state.status === "not-found") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-lg font-semibold text-foreground">Proposta não encontrada</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível carregar esta proposta agora.</p>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Tentar novamente
        </Button>
      </main>
    );
  }

  const { proposal } = state;
  const showDiscount = !isZeroDecimalString(proposal.discount_amount);

  return (
    <main className="min-h-dvh bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-md space-y-8">
        <div className="text-lg font-semibold tracking-tight">
          <span className="text-foreground">Obra</span>
          <span className="text-primary">Fácil</span>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">{proposal.number}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{proposal.title}</h1>
          {proposal.reference ? (
            <p className="text-sm text-muted-foreground">{proposal.reference}</p>
          ) : null}
        </div>

        <div className="space-y-1 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Preparado para</p>
          <p className="text-sm font-medium text-foreground">{proposal.customer_name}</p>
        </div>

        <div className="space-y-4 border-t border-border pt-4">
          {proposal.items.map((item) => (
            <div key={item.id} className="space-y-1">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{item.name}</span>
                <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {decimalStringToBrlDisplay(item.line_total)}
                </span>
              </div>
              {item.description ? (
                <p className="text-xs text-muted-foreground">{item.description}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {formatQuantityDisplay(item.quantity)}
                {item.unit ? ` ${item.unit}` : ""} × {decimalStringToBrlDisplay(item.unit_price)}
                {!isZeroDecimalString(item.line_discount)
                  ? ` (desconto: ${decimalStringToBrlDisplay(item.line_discount)})`
                  : ""}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Subtotal</span>
            <span className="text-sm font-medium tabular-nums text-foreground">
              {decimalStringToBrlDisplay(proposal.sale_subtotal)}
            </span>
          </div>
          {showDiscount ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Desconto</span>
              <span className="text-sm font-medium tabular-nums text-foreground">
                −{decimalStringToBrlDisplay(proposal.discount_amount)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="space-y-1 border-t border-border pt-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Total</p>
          <p className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">
            {decimalStringToBrlDisplay(proposal.total)}
          </p>
        </div>

        {proposal.status === "approved" ? (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-primary">
            <CheckCircle2 className="size-5" aria-hidden="true" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Proposta aprovada</p>
              {proposal.decision_by_name ? (
                <p className="text-xs text-primary/80">
                  por {proposal.decision_by_name}
                  {proposal.decided_at ? ` em ${formatDecidedAt(proposal.decided_at)}` : ""}
                </p>
              ) : null}
            </div>
          </div>
        ) : proposal.status === "rejected" ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted p-4 text-muted-foreground">
            <XCircle className="size-5" aria-hidden="true" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Proposta recusada</p>
              {proposal.decision_by_name ? (
                <p className="text-xs text-muted-foreground">
                  por {proposal.decision_by_name}
                  {proposal.decided_at ? ` em ${formatDecidedAt(proposal.decided_at)}` : ""}
                </p>
              ) : null}
            </div>
          </div>
        ) : proposal.status === "pending_approval" ? (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="space-y-1.5">
              <label htmlFor="proposal-decision-name" className="text-sm font-medium text-foreground">
                Seu nome
              </label>
              <input
                id="proposal-decision-name"
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="Seu nome completo"
                disabled={deciding}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
              {nameError ? <p className="text-sm text-destructive">{nameError}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="proposal-decision-note" className="text-sm font-medium text-foreground">
                Observação <span className="text-muted-foreground">(opcional)</span>
              </label>
              <textarea
                id="proposal-decision-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Alguma observação sobre sua decisão?"
                disabled={deciding}
                rows={3}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </div>

            {confirmingReject ? (
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <p className="text-sm text-foreground">
                  Recusar esta proposta? Esta ação não pode ser desfeita.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmingReject(false)}
                    disabled={deciding}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleRejectConfirm}
                    disabled={deciding}
                  >
                    Confirmar recusa
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button type="button" size="lg" onClick={handleApprove} disabled={deciding} className="w-full">
                  Aprovar proposta
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRejectStart}
                  disabled={deciding}
                  className="w-full text-muted-foreground"
                >
                  Recusar proposta
                </Button>
              </>
            )}

            {decisionError ? <p className="text-sm text-destructive">{decisionError}</p> : null}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Esta proposta ainda não foi enviada para aprovação.
          </p>
        )}
      </div>
    </main>
  );
}
