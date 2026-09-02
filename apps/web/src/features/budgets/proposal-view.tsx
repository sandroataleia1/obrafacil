"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { getProposalLines } from "./prototype/budget-totals";
import { approveBudgetProposal, rejectBudgetProposal } from "./prototype/budget";
import { useBudgetByToken } from "./prototype/use-budget";

export function ProposalView({ token }: { token: string }) {
  const router = useRouter();
  const { budget, refresh } = useBudgetByToken(token);
  const [justDecided, setJustDecided] = useState<"approved" | "rejected" | null>(null);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (budget === undefined) return null;

  if (budget === null) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Voltar
        </button>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-foreground">
            Proposta não encontrada
          </p>
          <p className="text-sm text-muted-foreground">
            O link pode estar incorreto ou expirado.
          </p>
        </div>
      </main>
    );
  }

  const lines = getProposalLines(budget);
  const total = lines.reduce((sum, line) => sum + line.amount, 0) - budget.discountAmount;

  function handleApprove() {
    if (!budget) return;
    const result = approveBudgetProposal(budget);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setJustDecided("approved");
    refresh();
  }

  function handleReject() {
    if (!budget) return;
    const result = rejectBudgetProposal(budget);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setConfirmingReject(false);
    setJustDecided("rejected");
    refresh();
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-md space-y-8">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Voltar"
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Voltar
          </button>
          <div className="text-lg font-semibold tracking-tight">
            <span className="text-foreground">Obra</span>
            <span className="text-primary">Fácil</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            Sua proposta
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {budget.name}
          </h1>
          {budget.projectReference ? (
            <p className="text-sm text-muted-foreground">{budget.projectReference}</p>
          ) : null}
        </div>

        <div className="space-y-1 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Preparado para</p>
          <p className="text-sm font-medium text-foreground">{budget.customerName}</p>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          {lines.map((line) => (
            <div key={line.id} className="flex items-center justify-between">
              <span className="text-sm text-foreground">{line.name}</span>
              <span className="text-sm font-medium tabular-nums text-foreground">
                {formatCurrency(line.amount)}
              </span>
            </div>
          ))}

          {budget.discountAmount > 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Desconto</span>
              <span className="text-sm font-medium tabular-nums text-foreground">
                −{formatCurrency(budget.discountAmount)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="space-y-1 border-t border-border pt-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Total
          </p>
          <p className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">
            {formatCurrency(total)}
          </p>
        </div>

        {budget.status === "approved" ? (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-primary">
            <CheckCircle2 className="size-5" aria-hidden="true" />
            <p className="text-sm font-medium">
              {justDecided === "approved" ? "Proposta aprovada" : "Você já aprovou esta proposta"}
            </p>
          </div>
        ) : budget.status === "rejected" ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted p-4 text-muted-foreground">
            <XCircle className="size-5" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              {justDecided === "rejected" ? "Proposta recusada" : "Esta proposta foi recusada"}
            </p>
          </div>
        ) : budget.status === "pending_approval" ? (
          <div className="space-y-2">
            {confirmingReject ? (
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <p className="text-sm text-foreground">Recusar esta proposta? Esta ação não pode ser desfeita.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => setConfirmingReject(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" variant="destructive" onClick={handleReject}>
                    Recusar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button type="button" size="lg" onClick={handleApprove} className="w-full">
                  Aprovar proposta
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingReject(true)}
                  className="w-full text-muted-foreground"
                >
                  Recusar proposta
                </Button>
              </>
            )}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
