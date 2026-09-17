"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Copy, Download, ExternalLink, Eye, FileText, Pencil, Plus, Send, Trash2 } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { civilDateToBrDisplay } from "@/lib/date";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { decimalStringToQuantityInputValue } from "@/lib/quantity";
import { formatCpfCnpj, formatE164PhoneForDisplay } from "@/lib/document";
import { useAuth } from "@/features/auth/auth-provider";
import { AddCatalogItemDialog } from "./items/add-catalog-item-dialog";
import { AddManualItemDialog } from "./items/add-manual-item-dialog";
import { EditItemDialog } from "./items/edit-item-dialog";
import {
  approveBudgetManually,
  deleteBudgetItem,
  getBudget,
  getBudgetProposalPdf,
  rejectBudgetManually,
  submitBudget,
} from "./budgets-client";
import { StatusBadge } from "./components/status-badge";
import {
  downloadPdfBlob,
  openPdfPlaceholder,
  pdfActionErrorMessage,
  resolvePdfIntoPlaceholder,
} from "./lib/pdf-actions";
import type { Budget, BudgetItem } from "./types";

const SOURCE_TYPE_LABEL: Record<BudgetItem["source_type"], string> = {
  catalog: "Catálogo",
  calculator: "Calculadora",
  manual: "Manual",
};

const CALCULATOR_TYPE_LABEL: Record<string, string> = {
  masonry: "Alvenaria",
  floor: "Piso",
  ceiling: "Forro",
  slab: "Laje",
};

function InfoRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={emphasis ? "text-base font-semibold text-foreground" : "text-sm text-muted-foreground"}>
        {label}
      </span>
      <span
        className={
          emphasis
            ? "text-xl font-semibold tabular-nums text-foreground"
            : "text-sm font-medium tabular-nums text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

/** ISO instant -> a short pt-BR date+time. `null` -> "—". */
function dateTimeDisplay(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** A short human summary for a calculator-sourced item — falls back to
 * just the calculator type label when the snapshot shape isn't cheaply
 * derivable (never dumps raw JSON on screen). */
function calculatorSummary(item: BudgetItem): string {
  const typeLabel = item.calculator_type ? CALCULATOR_TYPE_LABEL[item.calculator_type] ?? item.calculator_type : "Calculadora";
  const snapshot = item.calculation_snapshot;
  if (snapshot && typeof snapshot === "object") {
    const area = snapshot["area"] ?? snapshot["totalArea"] ?? snapshot["total_area"];
    if (typeof area === "number") {
      return `${typeLabel} — ${area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;
    }
  }
  return typeLabel;
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">Carregando orçamento</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
  );
}

type AddItemChoice = "choose" | "catalog" | "manual" | null;
type DecisionKind = "approve" | "reject";

export function BudgetDetail({ id }: { id: string }) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<"loading" | "success" | "error" | "not_found">("loading");
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | undefined>(undefined);
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | undefined>(undefined);

  const [linkCopied, setLinkCopied] = useState(false);

  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // §64: a 422 with a top-level `serverMessage` and no field errors is a
  // controlled business-rule failure (e.g. the Company's registered logo
  // file is missing) — shown verbatim, plus a link to fix it, instead of
  // the generic fallback message.
  const [submitErrorIsLogoMissing, setSubmitErrorIsLogoMissing] = useState(false);

  // §36: a single action slot — while any PDF action is in flight, every
  // PDF button (preview/view/download) is disabled, preventing a repeat
  // click from firing a second overlapping request.
  const [pdfAction, setPdfAction] = useState<"preview" | "download" | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [pendingDecision, setPendingDecision] = useState<DecisionKind | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const [addItemChoice, setAddItemChoice] = useState<AddItemChoice>(null);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [removingItem, setRemovingItem] = useState<BudgetItem | null>(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const [itemMutationInFlight, setItemMutationInFlight] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  // PROPOSAL-DOC-01B1 §9/§10: synchronous, pre-paint — the instant
  // `activeCompanyId` commits to a new value, `.current` reflects it
  // before any async continuation (a PDF fetch resolving from the OLD
  // Company) gets a chance to read it, mirroring the same guarantee
  // already hardened in `EditBudgetHeaderForm`/`BudgetForm`. A plain
  // `useEffect` here left a window where a PDF fetch for A resolving
  // right after a switch to B could still read `activeCompanyIdRef.current`
  // as stale/A before the effect had run — the exact race §10 tests for.
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const isStaleRequest = useCallback(
    (requestCompanyId: string | undefined) => activeCompanyIdRef.current !== requestCompanyId,
    []
  );

  // Ordering primitive shared by EVERY `Budget` GET that can reach this
  // screen (initial load, retry, and every post-mutation refresh) —
  // mirrors `ServiceOrderDetail`'s `orderReadSequenceRef` discipline. A
  // read started AFTER this one always carries a higher id; comparing the
  // ref's CURRENT value against the id captured at fire time correctly
  // rejects an older read even if it resolves after a newer one.
  // `currentBudgetIdRef` additionally guards against navigating from
  // Budget X to Budget Y within the same company.
  const budgetReadSequenceRef = useRef(0);
  const currentBudgetIdRef = useRef(id);
  // §9/§11: same pre-paint guarantee as `activeCompanyIdRef` above, for
  // the Budget id — a PDF fetch for Budget A resolving in the exact tick
  // after navigating to Budget B must see `currentBudgetIdRef.current`
  // already updated to B.
  useLayoutEffect(() => {
    currentBudgetIdRef.current = id;
  }, [id]);

  function nextBudgetReadContext() {
    return ++budgetReadSequenceRef.current;
  }

  function isCurrentBudgetRead(myReadId: number, requestCompanyId: string | undefined, requestBudgetId: string) {
    return (
      budgetReadSequenceRef.current === myReadId &&
      activeCompanyIdRef.current === requestCompanyId &&
      currentBudgetIdRef.current === requestBudgetId
    );
  }

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    const requestBudgetId = id;
    const myReadId = nextBudgetReadContext();
    setStatus("loading");
    setBudget(null);
    setLinkCopied(false);
    setSubmitConfirmOpen(false);
    setSubmitting(false);
    setSubmitError(null);
    setSubmitErrorIsLogoMissing(false);
    setPdfAction(null);
    setPdfError(null);
    setPendingDecision(null);
    setDecisionNote("");
    setDecisionSubmitting(false);
    setDecisionError(null);
    setAddItemChoice(null);
    setEditingItem(null);
    setRemovingItem(null);
    setItemActionError(null);
    setItemMutationInFlight(null);
    try {
      const data = await getBudget(id);
      if (requestSequence.current !== requestId) return;
      if (!isCurrentBudgetRead(myReadId, requestCompanyId, requestBudgetId)) return;
      setBudget(data);
      setLoadedCompanyId(requestCompanyId);
      setResolvedCompanyId(requestCompanyId);
      setStatus("success");
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      if (!isCurrentBudgetRead(myReadId, requestCompanyId, requestBudgetId)) return;
      setResolvedCompanyId(requestCompanyId);
      if (error instanceof ApiError && error.status === 404) {
        setStatus("not_found");
        return;
      }
      setStatus("error");
    }
  }, [id, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /**
   * Re-fetches the Budget without clearing whatever conflict/error message
   * the caller already set. The ONE shared refresh path for every
   * post-mutation re-GET (submit, approve/reject-manually, and every item
   * add/edit/delete — success AND 409/422) — item mutations never return
   * the parent's totals themselves, so this is the ONLY way the Detail
   * page's financials/items ever reflect a just-mutated line. Participates
   * in the same `budgetReadSequenceRef` ordering as `load()`.
   */
  async function refreshBudgetAfterMutation() {
    const requestCompanyId = activeCompanyId;
    const requestBudgetId = id;
    const myReadId = nextBudgetReadContext();
    try {
      const data = await getBudget(id);
      if (!isCurrentBudgetRead(myReadId, requestCompanyId, requestBudgetId)) return;
      setBudget(data);
    } catch {
      // The conflict/error message already surfaced; a failed refresh
      // here is secondary and never replaces it with a second message.
    }
  }

  const isCurrentTenant = budget !== null && loadedCompanyId === activeCompanyId;
  const isResolvedForCurrentTenant = resolvedCompanyId !== undefined && resolvedCompanyId === activeCompanyId;

  function isActionStale(requestCompanyId: string | undefined, requestBudgetId: string) {
    return activeCompanyIdRef.current !== requestCompanyId || currentBudgetIdRef.current !== requestBudgetId;
  }

  async function handleCopyLink() {
    if (!budget || !budget.proposal_token) return;
    const url = `${window.location.origin}/proposta/${budget.proposal_token}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt("Copie o link da proposta:", url);
      }
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      window.prompt("Copie o link da proposta:", url);
    }
  }

  async function handleConfirmSubmit() {
    if (!budget) return;
    const requestCompanyId = activeCompanyId;
    const requestBudgetId = budget.id;
    const myReadId = nextBudgetReadContext();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitErrorIsLogoMissing(false);
    try {
      const updated = await submitBudget(budget.id);
      if (isActionStale(requestCompanyId, requestBudgetId)) return;
      if (isCurrentBudgetRead(myReadId, requestCompanyId, requestBudgetId)) {
        setBudget(updated);
      }
      setSubmitConfirmOpen(false);
    } catch (error) {
      if (isActionStale(requestCompanyId, requestBudgetId)) return;
      // §64/§11: closes the confirm dialog on ANY failure — not just
      // success — so the error message (and, for the logo-missing case,
      // its fix-it link) is actually visible/interactive instead of
      // sitting inert behind a still-open modal.
      setSubmitConfirmOpen(false);
      // A controlled business-rule 422 (no field errors, just a
      // top-level message — e.g. the Company logo is missing) is shown
      // verbatim instead of the generic fallback, with a link to fix it.
      if (error instanceof ApiValidationError && error.serverMessage) {
        setSubmitError(error.serverMessage);
        setSubmitErrorIsLogoMissing(true);
      } else {
        setSubmitError("Não foi possível disponibilizar este orçamento agora.");
      }
    } finally {
      if (!isActionStale(requestCompanyId, requestBudgetId)) setSubmitting(false);
    }
  }

  /**
   * §27-29/§35: used both for the draft "Visualizar prévia PDF" action
   * (GET only — never submits, never generates a token, never changes
   * status) and for the pending/decided "Visualizar PDF" action (the
   * same authenticated endpoint renders from the frozen historical
   * snapshot once submitted). Tenant-safe: a stale response (Company or
   * Budget changed while the request was in flight) never opens/repaints
   * anything and closes the now-orphaned placeholder tab.
   */
  async function handleViewPdf() {
    if (!budget || pdfAction) return;
    const requestCompanyId = activeCompanyId;
    const requestBudgetId = budget.id;
    const placeholder = openPdfPlaceholder();
    setPdfAction("preview");
    setPdfError(null);
    const result = await resolvePdfIntoPlaceholder(
      placeholder,
      () => getBudgetProposalPdf(requestBudgetId),
      () => isActionStale(requestCompanyId, requestBudgetId)
    );
    if (isActionStale(requestCompanyId, requestBudgetId)) return;
    setPdfAction(null);
    if (!result.ok && result.error) {
      setPdfError(pdfActionErrorMessage(result.error));
    }
  }

  async function handleDownloadPdf() {
    if (!budget || pdfAction) return;
    const requestCompanyId = activeCompanyId;
    const requestBudgetId = budget.id;
    setPdfAction("download");
    setPdfError(null);
    const result = await downloadPdfBlob(
      () => getBudgetProposalPdf(requestBudgetId),
      `${budget.number}.pdf`,
      () => isActionStale(requestCompanyId, requestBudgetId)
    );
    if (isActionStale(requestCompanyId, requestBudgetId)) return;
    setPdfAction(null);
    if (!result.ok && result.error) {
      setPdfError(pdfActionErrorMessage(result.error));
    }
  }

  async function handleConfirmDecision() {
    if (!budget || !pendingDecision) return;
    const requestCompanyId = activeCompanyId;
    const requestBudgetId = budget.id;
    const myReadId = nextBudgetReadContext();
    const note = decisionNote.trim() || null;
    setDecisionSubmitting(true);
    setDecisionError(null);
    try {
      const updated =
        pendingDecision === "approve"
          ? await approveBudgetManually(budget.id, { note })
          : await rejectBudgetManually(budget.id, { note });
      if (isActionStale(requestCompanyId, requestBudgetId)) return;
      if (isCurrentBudgetRead(myReadId, requestCompanyId, requestBudgetId)) {
        setBudget(updated);
      }
      setPendingDecision(null);
      setDecisionNote("");
    } catch (error) {
      if (isActionStale(requestCompanyId, requestBudgetId)) return;
      if (error instanceof ApiError && error.status === 409) {
        setPendingDecision(null);
        setDecisionNote("");
        setDecisionError("Este orçamento já recebeu uma decisão.");
        void refreshBudgetAfterMutation();
        return;
      }
      setDecisionError("Não foi possível registrar esta decisão agora.");
    } finally {
      if (!isActionStale(requestCompanyId, requestBudgetId)) setDecisionSubmitting(false);
    }
  }

  /** Shared success path for Add/Edit item dialogs — neither response
   * carries the Budget's new totals, so this is the ONLY place that
   * refreshes them. */
  function handleItemMutated() {
    setItemActionError(null);
    void refreshBudgetAfterMutation();
  }

  function handleItemConflict(message: string) {
    setItemActionError(message);
    void refreshBudgetAfterMutation();
  }

  async function handleRemoveItem() {
    if (!budget || !removingItem) return;
    const targetItem = removingItem;
    const requestCompanyId = activeCompanyId;
    setItemMutationInFlight(targetItem.id);
    setItemActionError(null);
    try {
      await deleteBudgetItem(budget.id, targetItem.id);
      if (isStaleRequest(requestCompanyId)) return;
      setRemovingItem(null);
      handleItemMutated();
    } catch (error) {
      if (isStaleRequest(requestCompanyId)) return;
      setRemovingItem(null);
      if (error instanceof ApiError && error.status === 409) {
        handleItemConflict("O orçamento foi alterado por outro usuário.");
      } else if (error instanceof ApiValidationError) {
        // 422: discount_amount > new sale_subtotal after removal — the
        // item was NOT deleted server-side, so it must visibly remain
        // and the discount is never auto-adjusted by this code.
        setItemActionError("Reduza o desconto do orçamento antes de remover este item.");
      } else {
        setItemActionError("Não foi possível remover este item agora.");
      }
    } finally {
      if (!isStaleRequest(requestCompanyId)) setItemMutationInFlight(null);
    }
  }

  if (status === "error" && isResolvedForCurrentTenant) {
    return (
      <div className="space-y-4">
        <BackLink title="Orçamento" icon={FileText} href="/orcamentos" />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar este orçamento agora.
          </p>
          <Button type="button" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (status === "not_found" && isResolvedForCurrentTenant) {
    return (
      <div className="space-y-4">
        <BackLink title="Orçamento" icon={FileText} href="/orcamentos" />
        <EmptyState
          icon={FileText}
          title="Orçamento não encontrado"
          description="Ele pode ter sido removido ou pertencer a outra empresa."
        />
      </div>
    );
  }

  if (!isCurrentTenant || status === "loading" || !budget) {
    return (
      <div className="space-y-4">
        <BackLink title="Orçamento" icon={FileText} href="/orcamentos" />
        <DetailSkeleton />
      </div>
    );
  }

  const isDraft = budget.status === "draft";
  const isPendingApproval = budget.status === "pending_approval";
  const isDecided = budget.status === "approved" || budget.status === "rejected";

  return (
    <div className="space-y-6 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <BackLink title={budget.number} description={budget.title} icon={FileText} href="/orcamentos" />
        <StatusBadge status={budget.status} />
      </div>

      {budget.reference ? <p className="-mt-4 text-sm text-muted-foreground">{budget.reference}</p> : null}

      {submitError ? (
        <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <p>{submitError}</p>
          {submitErrorIsLogoMissing ? (
            <Link href="/configuracoes/empresa" className="font-medium underline">
              Atualizar perfil da empresa
            </Link>
          ) : null}
        </div>
      ) : null}
      {pdfError ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {pdfError}
        </p>
      ) : null}
      {decisionError ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {decisionError}
        </p>
      ) : null}
      {itemActionError ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {itemActionError}
        </p>
      ) : null}

      {isDraft ? (
        <div>
          <Link
            href={`/orcamentos/${budget.id}/editar`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Editar
          </Link>
        </div>
      ) : null}

      <section className="space-y-1 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-sm font-semibold text-foreground">Cliente</h2>
          <Link
            href={`/clientes/${budget.customer_id}`}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Ver cliente
            <ExternalLink className="size-3" aria-hidden="true" />
          </Link>
        </div>
        <InfoRow label="Nome" value={budget.customer.name} />
        {budget.customer.document ? <InfoRow label="Documento" value={formatCpfCnpj(budget.customer.document)} /> : null}
        {budget.customer.phone ? <InfoRow label="Telefone" value={formatE164PhoneForDisplay(budget.customer.phone)} /> : null}
        {budget.customer.email ? <InfoRow label="E-mail" value={budget.customer.email} /> : null}
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-sm font-semibold text-foreground">Itens</h2>
          {isDraft ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setAddItemChoice("choose")}>
              <Plus className="size-3.5" aria-hidden="true" />
              Adicionar item
            </Button>
          ) : null}
        </div>
        {budget.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum item neste orçamento.</p>
        ) : (
          <div className="divide-y divide-border">
            {budget.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {SOURCE_TYPE_LABEL[item.source_type]}
                    </span>
                  </div>
                  {item.code ? <p className="text-xs text-muted-foreground">{item.code}</p> : null}
                  {item.source_type === "calculator" ? (
                    <p className="text-xs text-muted-foreground">{calculatorSummary(item)}</p>
                  ) : null}
                  {item.description ? <p className="text-xs text-muted-foreground">{item.description}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    {decimalStringToQuantityInputValue(item.quantity)} {item.unit ?? ""} ×{" "}
                    {decimalStringToBrlDisplay(item.unit_price)}
                    {item.line_discount !== "0.00" ? ` − ${decimalStringToBrlDisplay(item.line_discount)}` : ""}
                  </p>
                  {item.unit_cost !== null ? (
                    <p className="text-xs text-muted-foreground">
                      Custo: {decimalStringToBrlDisplay(item.unit_cost)}
                      {item.line_cost_total !== null ? ` (total ${decimalStringToBrlDisplay(item.line_cost_total)})` : ""}
                    </p>
                  ) : null}
                  {item.notes ? <p className="text-xs text-muted-foreground">{item.notes}</p> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <p className="text-sm font-medium text-foreground">{decimalStringToBrlDisplay(item.line_total)}</p>
                  {isDraft ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingItem(item)}
                        disabled={itemMutationInFlight === item.id}
                        aria-label={`Editar ${item.name}`}
                        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemovingItem(item)}
                        disabled={itemMutationInFlight === item.id}
                        aria-label={`Remover ${item.name}`}
                        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1 rounded-xl border border-border bg-card p-4">
        <h2 className="pb-2 text-sm font-semibold text-foreground">Financeiro</h2>
        <InfoRow label="Subtotal de venda" value={decimalStringToBrlDisplay(budget.sale_subtotal) ?? "—"} />
        {budget.cost_subtotal !== null ? (
          <InfoRow label="Custo" value={decimalStringToBrlDisplay(budget.cost_subtotal) ?? "—"} />
        ) : (
          <div className="py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Custo</span>
              <span className="text-sm font-medium text-foreground">—</span>
            </div>
            <p className="text-xs text-muted-foreground">Custo não informado para todos os itens</p>
          </div>
        )}
        <InfoRow label="Desconto" value={decimalStringToBrlDisplay(budget.discount_amount) ?? "—"} />
        <InfoRow
          label="Margem"
          value={budget.margin_amount !== null ? decimalStringToBrlDisplay(budget.margin_amount) ?? "—" : "—"}
        />
        <InfoRow
          label="Margem %"
          value={budget.margin_percentage !== null ? `${budget.margin_percentage.replace(".", ",")}%` : "—"}
        />
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span className="text-base font-semibold text-foreground">{decimalStringToBrlDisplay(budget.total)}</span>
        </div>
      </section>

      {budget.valid_until || budget.payment_terms || budget.execution_terms || budget.proposal_terms ? (
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h2 className="pb-1 text-sm font-semibold text-foreground">Condições da proposta</h2>
          {budget.valid_until ? <InfoRow label="Validade" value={civilDateToBrDisplay(budget.valid_until) ?? "—"} /> : null}
          {budget.payment_terms ? (
            <div className="py-1">
              <p className="text-sm text-muted-foreground">Condições de pagamento</p>
              <p className="whitespace-pre-line text-sm text-foreground">{budget.payment_terms}</p>
            </div>
          ) : null}
          {budget.execution_terms ? (
            <div className="py-1">
              <p className="text-sm text-muted-foreground">Prazo e condições de execução</p>
              <p className="whitespace-pre-line text-sm text-foreground">{budget.execution_terms}</p>
            </div>
          ) : null}
          {budget.proposal_terms ? (
            <div className="py-1">
              <p className="text-sm text-muted-foreground">Condições gerais</p>
              <p className="whitespace-pre-line text-sm text-foreground">{budget.proposal_terms}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {budget.notes ? (
        <section className="space-y-1 rounded-xl border border-border bg-card p-4">
          <h2 className="pb-2 text-sm font-semibold text-foreground">Observações internas</h2>
          <p className="text-sm text-foreground">{budget.notes}</p>
        </section>
      ) : null}

      {isDecided ? (
        <section className="space-y-1 rounded-xl border border-border bg-card p-4">
          <h2 className="pb-2 text-sm font-semibold text-foreground">Decisão</h2>
          <InfoRow label="Decidido em" value={dateTimeDisplay(budget.decided_at)} />
          {budget.decision_source === "public_link" ? (
            <>
              <p className="text-sm text-foreground">
                {budget.status === "approved" ? "Aprovado pelo cliente via proposta" : "Recusado pelo cliente via proposta"}
              </p>
              {budget.decision_by_name ? (
                <p className="text-sm text-muted-foreground">{budget.decision_by_name}</p>
              ) : null}
              {/* §19: decision_note is captured on the public approve/reject
                  payload too (not just manual_internal) — the authenticated
                  Detail must surface it here whenever present, never only
                  for the manual_internal path (§21: the public contract
                  itself is unchanged, this reads decision_note from the
                  already-authenticated BudgetResource). */}
              {budget.decision_note ? (
                <div className="pt-1">
                  <p className="text-xs font-medium text-muted-foreground">Observação</p>
                  <p className="text-sm text-foreground">{budget.decision_note}</p>
                </div>
              ) : null}
            </>
          ) : budget.decision_source === "manual_internal" ? (
            <>
              <p className="text-sm text-foreground">Decisão registrada internamente</p>
              {budget.decision_note ? <p className="text-sm text-muted-foreground">{budget.decision_note}</p> : null}
            </>
          ) : null}
        </section>
      ) : null}

      {budget.status === "approved" ? (
        <Link
          href={`/obras/nova?sourceBudgetId=${budget.id}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Criar obra a partir deste orçamento
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      ) : null}

      <section className="space-y-1 rounded-xl border border-border bg-card p-4">
        <h2 className="pb-2 text-sm font-semibold text-foreground">Histórico</h2>
        <InfoRow label="Criado em" value={dateTimeDisplay(budget.created_at)} />
        <InfoRow label="Atualizado em" value={dateTimeDisplay(budget.updated_at)} />
        {budget.submitted_at ? <InfoRow label="Disponibilizado em" value={dateTimeDisplay(budget.submitted_at)} /> : null}
      </section>

      {/* §59: every proposal-related action lives in this ONE card,
          instead of a scattered list of independent buttons at the
          bottom of the page. */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Proposta</h2>

        {budget.proposal_company ? (
          <p className="text-xs text-muted-foreground">
            Emitida por: {budget.proposal_company.trade_name || budget.proposal_company.name}
          </p>
        ) : null}

        {isDraft ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => void handleViewPdf()}
            disabled={pdfAction !== null}
            aria-busy={pdfAction === "preview"}
          >
            <Eye className="size-4" aria-hidden="true" />
            {pdfAction === "preview" ? "Gerando prévia..." : "Visualizar prévia PDF"}
          </Button>
        ) : null}

        {budget.proposal_token !== null ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/proposta/${budget.proposal_token}`}>Visualizar proposta</Link>}
            />
            <Button type="button" variant="outline" onClick={() => void handleCopyLink()}>
              <Copy className="size-4" aria-hidden="true" />
              {linkCopied ? "Link copiado" : "Copiar link"}
            </Button>
          </div>
        ) : null}

        {!isDraft && budget.proposal_token !== null ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleViewPdf()}
              disabled={pdfAction !== null}
              aria-busy={pdfAction === "preview"}
            >
              <Eye className="size-4" aria-hidden="true" />
              {pdfAction === "preview" ? "Gerando..." : "Visualizar PDF"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleDownloadPdf()}
              disabled={pdfAction !== null}
              aria-busy={pdfAction === "download"}
            >
              <Download className="size-4" aria-hidden="true" />
              {pdfAction === "download" ? "Baixando..." : "Baixar PDF"}
            </Button>
          </div>
        ) : null}

        {isDraft ? (
          <Button type="button" size="lg" className="w-full" onClick={() => setSubmitConfirmOpen(true)}>
            <Send className="size-4" aria-hidden="true" />
            Disponibilizar para aprovação
          </Button>
        ) : null}

        {isPendingApproval ? (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => setPendingDecision("approve")}>
              Registrar aprovação
            </Button>
            <Button type="button" variant="destructive" onClick={() => setPendingDecision("reject")}>
              Registrar recusa
            </Button>
          </div>
        ) : null}
      </section>

      <ConfirmActionDialog
        open={submitConfirmOpen}
        onOpenChange={(open) => !open && setSubmitConfirmOpen(false)}
        title="Disponibilizar para aprovação?"
        confirmLabel="Disponibilizar"
        disabled={submitting}
        onConfirm={() => void handleConfirmSubmit()}
      >
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>Depois de disponibilizado, este orçamento não poderá mais ser editado.</p>
          <p>Os dados da empresa, logo, itens, valores e condições serão congelados nesta versão.</p>
          <p>Para alterar a proposta depois, será necessário criar um novo orçamento.</p>
        </div>
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={pendingDecision === "approve"}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDecision(null);
            setDecisionNote("");
          }
        }}
        title="Registrar aprovação?"
        confirmLabel="Confirmar aprovação"
        disabled={decisionSubmitting}
        onConfirm={() => void handleConfirmDecision()}
      >
        <div className="space-y-1.5">
          <label htmlFor="approve-note" className="text-sm font-medium text-foreground">
            Observação
          </label>
          <textarea
            id="approve-note"
            value={decisionNote}
            onChange={(event) => setDecisionNote(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={pendingDecision === "reject"}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDecision(null);
            setDecisionNote("");
          }
        }}
        title="Registrar recusa?"
        confirmLabel="Confirmar recusa"
        destructive
        disabled={decisionSubmitting}
        onConfirm={() => void handleConfirmDecision()}
      >
        <div className="space-y-1.5">
          <label htmlFor="reject-note" className="text-sm font-medium text-foreground">
            Observação
          </label>
          <textarea
            id="reject-note"
            value={decisionNote}
            onChange={(event) => setDecisionNote(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </ConfirmActionDialog>

      <ResponsiveDialog
        open={addItemChoice === "choose"}
        onOpenChange={(open) => !open && setAddItemChoice(null)}
        title="Adicionar item"
        size="sm"
      >
        <div className="grid grid-cols-2 gap-3 pb-1">
          <button
            type="button"
            onClick={() => setAddItemChoice("catalog")}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
          >
            Catálogo
          </button>
          <button
            type="button"
            onClick={() => setAddItemChoice("manual")}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
          >
            Item manual
          </button>
        </div>
      </ResponsiveDialog>

      {addItemChoice === "catalog" ? (
        <AddCatalogItemDialog
          open
          onOpenChange={(open) => !open && setAddItemChoice(null)}
          budgetId={budget.id}
          requestCompanyId={activeCompanyId}
          isStaleRequest={isStaleRequest}
          onAdded={() => {
            setAddItemChoice(null);
            handleItemMutated();
          }}
          onConflict={(message) => {
            setAddItemChoice(null);
            handleItemConflict(message);
          }}
        />
      ) : null}

      {addItemChoice === "manual" ? (
        <AddManualItemDialog
          open
          onOpenChange={(open) => !open && setAddItemChoice(null)}
          budgetId={budget.id}
          requestCompanyId={activeCompanyId}
          isStaleRequest={isStaleRequest}
          onAdded={() => {
            setAddItemChoice(null);
            handleItemMutated();
          }}
          onConflict={(message) => {
            setAddItemChoice(null);
            handleItemConflict(message);
          }}
        />
      ) : null}

      {editingItem ? (
        <EditItemDialog
          open={editingItem !== null}
          onOpenChange={(open) => !open && setEditingItem(null)}
          budgetId={budget.id}
          item={editingItem}
          requestCompanyId={activeCompanyId}
          isStaleRequest={isStaleRequest}
          onUpdated={() => {
            setEditingItem(null);
            handleItemMutated();
          }}
          onConflict={(message) => {
            setEditingItem(null);
            handleItemConflict(message);
          }}
        />
      ) : null}

      <ConfirmActionDialog
        open={removingItem !== null}
        onOpenChange={(open) => !open && setRemovingItem(null)}
        title="Remover este item do orçamento?"
        confirmLabel="Remover"
        destructive
        disabled={removingItem !== null && itemMutationInFlight === removingItem.id}
        onConfirm={() => void handleRemoveItem()}
      />
    </div>
  );
}
