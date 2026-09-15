"use client";

/**
 * Public "Proposta" screen — GET/POST /api/v1/proposals/{token}. No auth,
 * no CurrentCompany/tenant context, no localStorage/sessionStorage: this
 * page must render correctly in a fully logged-out browser (it is normally
 * opened from a WhatsApp link on a phone). Only ever reads the fields on
 * `PublicProposal`/`PublicProposalItem` — never any internal/cost/tenant
 * field (those don't even exist on this contract; see `types.ts`).
 *
 * PROPOSAL-DOC-01B §38-40: redesigned so the issuing COMPANY is the
 * protagonist — the document reads like it came from that company, not
 * from "ObraFácil" (which appears only as a discreet footer credit).
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Eye, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { civilDateToBrDisplay } from "@/lib/date";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { decimalStringToQuantityDisplay } from "@/lib/quantity";
import { formatCpfCnpj, formatE164PhoneForDisplay } from "@/lib/document";
import {
  downloadPdfBlob,
  openPdfPlaceholder,
  pdfActionErrorMessage,
  resolvePdfIntoPlaceholder,
} from "./lib/pdf-actions";
import { getPublicProposal, getPublicProposalPdf, approvePublicProposal, rejectPublicProposal } from "./proposal-client";
import type { ProposalCompany, PublicProposal } from "./types";

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | { status: "loaded"; proposal: PublicProposal };

const RATE_LIMIT_MESSAGE = "Muitas tentativas. Aguarde um momento e tente novamente.";
const GENERIC_DECISION_ERROR = "Não foi possível registrar sua decisão agora. Tente novamente.";

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

/** §41: assembles the address into display lines, omitting absent parts — never an empty label. */
function addressLines(company: ProposalCompany): string[] {
  const { address } = company;
  const lines: string[] = [];

  const streetLine = [address.street, address.number].filter(Boolean).join(", ");
  if (streetLine) lines.push(streetLine);
  if (address.complement) lines.push(address.complement);
  if (address.neighborhood) lines.push(address.neighborhood);

  const cityLine = [address.city, address.state].filter(Boolean).join(" - ");
  if (cityLine) lines.push(cityLine);
  if (address.postal_code) lines.push(formatCep(address.postal_code));
  if (address.reference_point) lines.push(address.reference_point);

  return lines;
}

function formatCep(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function CompanyHeader({ company }: { company: ProposalCompany }) {
  const displayName = company.trade_name || company.name;
  const lines = addressLines(company);
  const contactLine = [company.phone, company.whatsapp].filter(Boolean).map((v) => formatE164PhoneForDisplay(v)).join(" · ");

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:gap-6">
      {company.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- external, per-company logo URL; next/image's domain allowlist doesn't fit a multi-tenant SaaS.
        <img
          src={company.logo_url}
          alt={`Logo de ${displayName}`}
          className="size-16 shrink-0 rounded-lg border border-border object-contain sm:size-20"
        />
      ) : null}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{displayName}</h1>
        {company.legal_name && company.legal_name !== displayName ? (
          <p className="text-sm text-muted-foreground">{company.legal_name}</p>
        ) : null}
        {company.document ? (
          <p className="text-sm text-muted-foreground">CNPJ {formatCpfCnpj(company.document)}</p>
        ) : null}
        {contactLine ? <p className="text-sm text-muted-foreground">{contactLine}</p> : null}
        {company.email ? <p className="text-sm text-muted-foreground">{company.email}</p> : null}
        {lines.length > 0 ? <p className="text-sm text-muted-foreground">{lines.join(" · ")}</p> : null}
      </div>
    </div>
  );
}

export function ProposalView({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const [pdfAction, setPdfAction] = useState<"view" | "download" | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

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

  async function handleViewPdf(proposalNumber: string) {
    if (pdfAction) return;
    const placeholder = openPdfPlaceholder();
    setPdfAction("view");
    setPdfError(null);
    const result = await resolvePdfIntoPlaceholder(
      placeholder,
      () => getPublicProposalPdf(token),
      () => false
    );
    setPdfAction(null);
    if (!result.ok && result.error) {
      setPdfError(result.error === "rate-limited" ? RATE_LIMIT_MESSAGE : pdfActionErrorMessage(result.error));
    }
    void proposalNumber;
  }

  async function handleDownloadPdf(proposalNumber: string) {
    if (pdfAction) return;
    setPdfAction("download");
    setPdfError(null);
    const result = await downloadPdfBlob(
      () => getPublicProposalPdf(token),
      `${proposalNumber}.pdf`,
      () => false
    );
    setPdfAction(null);
    if (!result.ok && result.error) {
      setPdfError(result.error === "rate-limited" ? RATE_LIMIT_MESSAGE : pdfActionErrorMessage(result.error));
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
  const hasConditions = Boolean(proposal.payment_terms || proposal.execution_terms || proposal.proposal_terms);

  return (
    <main className="min-h-dvh bg-background px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        {proposal.company ? <CompanyHeader company={proposal.company} /> : null}

        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">{proposal.number}</p>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">PROPOSTA COMERCIAL</h2>
          <p className="text-lg font-medium text-foreground">{proposal.title}</p>
          {proposal.reference ? <p className="text-sm text-muted-foreground">{proposal.reference}</p> : null}
          <p className="text-sm text-muted-foreground">
            {proposal.submitted_at ? `Emitida em ${formatDecidedAt(proposal.submitted_at)}` : null}
            {proposal.valid_until ? (
              <span className="font-medium text-foreground"> · Válida até {civilDateToBrDisplay(proposal.valid_until)}</span>
            ) : null}
          </p>
        </div>

        <div className="space-y-1 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Preparado para</p>
          <p className="text-sm font-medium text-foreground">{proposal.customer_name}</p>
        </div>

        {/* §45-46: a real table on desktop, stacked cards on mobile — never a table forced into horizontal scroll. */}
        <div className="border-t border-border pt-4">
          <table className="hidden w-full sm:table">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="py-2">Descrição</th>
                <th className="py-2 text-right">Qtd.</th>
                <th className="py-2">Un.</th>
                <th className="py-2 text-right">Preço unit.</th>
                <th className="py-2 text-right">Desconto</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {proposal.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2.5 align-top">
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    {item.description ? <p className="text-xs text-muted-foreground">{item.description}</p> : null}
                  </td>
                  <td className="py-2.5 text-right align-top text-sm tabular-nums text-foreground">
                    {decimalStringToQuantityDisplay(item.quantity)}
                  </td>
                  <td className="py-2.5 align-top text-sm text-muted-foreground">{item.unit ?? "—"}</td>
                  <td className="py-2.5 text-right align-top text-sm tabular-nums text-foreground">
                    {decimalStringToBrlDisplay(item.unit_price)}
                  </td>
                  <td className="py-2.5 text-right align-top text-sm tabular-nums text-foreground">
                    {isZeroDecimalString(item.line_discount) ? "—" : decimalStringToBrlDisplay(item.line_discount)}
                  </td>
                  <td className="py-2.5 text-right align-top text-sm font-medium tabular-nums text-foreground">
                    {decimalStringToBrlDisplay(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-4 sm:hidden" data-testid="items-mobile">
            {proposal.items.map((item) => (
              <div key={item.id} className="space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{item.name}</span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                    {decimalStringToBrlDisplay(item.line_total)}
                  </span>
                </div>
                {item.description ? <p className="text-xs text-muted-foreground">{item.description}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {decimalStringToQuantityDisplay(item.quantity)}
                  {item.unit ? ` ${item.unit}` : ""} × {decimalStringToBrlDisplay(item.unit_price)}
                  {!isZeroDecimalString(item.line_discount)
                    ? ` (desconto: ${decimalStringToBrlDisplay(item.line_discount)})`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-4" data-testid="proposal-summary">
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

        {hasConditions ? (
          <div className="space-y-4 border-t border-border pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Condições</h3>
            {proposal.payment_terms ? (
              <div>
                <p className="text-sm font-medium text-foreground">Condições de pagamento</p>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{proposal.payment_terms}</p>
              </div>
            ) : null}
            {proposal.execution_terms ? (
              <div>
                <p className="text-sm font-medium text-foreground">Prazo e condições de execução</p>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{proposal.execution_terms}</p>
              </div>
            ) : null}
            {proposal.proposal_terms ? (
              <div>
                <p className="text-sm font-medium text-foreground">Condições gerais</p>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{proposal.proposal_terms}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2 border-t border-border pt-4">
          {pdfError ? (
            <p role="alert" className="text-sm text-destructive">
              {pdfError}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={pdfAction !== null}
              aria-busy={pdfAction === "view"}
              onClick={() => void handleViewPdf(proposal.number)}
            >
              <Eye className="size-4" aria-hidden="true" />
              {pdfAction === "view" ? "Gerando..." : "Visualizar PDF"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={pdfAction !== null}
              aria-busy={pdfAction === "download"}
              onClick={() => void handleDownloadPdf(proposal.number)}
            >
              <Download className="size-4" aria-hidden="true" />
              {pdfAction === "download" ? "Baixando..." : "Baixar PDF"}
            </Button>
          </div>
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
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Responder proposta</h3>
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

        <p className="pt-6 text-center text-xs text-muted-foreground">
          Proposta gerada com <span className="font-medium">ObraFácil</span>
        </p>
      </div>
    </main>
  );
}
