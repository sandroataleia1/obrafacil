"use client";

/**
 * FRONTEND-PROJECTS-01 §31-37/§44-45. GET /api/v1/projects/{id} is the
 * sole source of truth for the Project header — mirrors
 * `ServiceOrderDetail`'s loading/404/error/retry + tenant-safety
 * discipline. The heavy financial/materials/purchases aggregation below
 * stays exactly as before (still prototype/localStorage-backed per
 * modules — §46), only re-keyed off the real `project.id` and the real
 * `project.source_budget` instead of the deleted legacy Budget prototype.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, ChevronDown, ChevronRight, ExternalLink, FileText, Info, Receipt } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { civilDateToBrDisplay } from "@/lib/date";
import { decimalStringToBrlDisplay, formatCurrency } from "@/lib/currency";
import { formatCep } from "@/lib/document";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { sumCosts } from "@/features/project-costs/prototype/cost-totals";
import { useProjectCosts } from "@/features/project-costs/prototype/use-project-costs";
import { PROJECT_COST_CATEGORY_LABEL } from "@/features/project-costs/types";
import { listPayablesByProject } from "@/features/payables/prototype/payable-store";
import type { Payable } from "@/features/payables/types";
import { listReceivablesByProject } from "@/features/receivables/prototype/receivable-store";
import { listReceiptsByReceivable } from "@/features/receivables/prototype/receipt-store";
import type { Receipt as ReceiptModel, Receivable } from "@/features/receivables/types";
import { formatQuantity } from "@/lib/quantity";
import { formatMaterialUnitCode } from "@/features/materials/material-unit";
import { useMaterialRequirements } from "@/features/materials/use-material-requirements";
import { requirementQuantityForLegacyPlanning } from "@/features/materials/requirement-quantity";
import { listConsumptionsByProject } from "@/features/materials/prototype/material-consumption-store";
import type { MaterialConsumption } from "@/features/materials/types";
import { calculatePurchaseOrderFulfillment } from "@/features/purchases/prototype/fulfillment";
import { listReceiptItemsByPurchaseOrder } from "@/features/purchases/prototype/goods-receipt-item-store";
import { listPurchaseOrdersByProject } from "@/features/purchases/prototype/purchase-order-store";
import { listItemsByPurchaseOrders } from "@/features/purchases/prototype/purchase-order-item-store";
import {
  calculateMaterialPlanning,
  calculatePurchaseOrderTotal,
  type MaterialPlanning,
} from "@/features/purchases/prototype/purchase-totals";
import type { GoodsReceiptItem, PurchaseOrder, PurchaseOrderItem } from "@/features/purchases/types";
import { ProjectTeamSummary } from "@/features/projects/team/project-team-summary";
import { todayIso } from "@/lib/date";
import { isProjectLate, projectDaysLate } from "./project-schedule";
import { buildProjectManagementSummary } from "./prototype/project-summary";
import { getProject, updateProject } from "./projects-client";
import { PROJECT_STATUS_LABEL } from "./types";
import type { Project, ProjectStatus } from "./types";
import { ProjectStatusBadge } from "./components/status-badge";

const STATUS_OPTIONS: ProjectStatus[] = ["planning", "in_progress", "paused", "completed"];

function InfoRow({
  label,
  value,
  emphasis,
  negative,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={emphasis ? "text-base font-semibold text-foreground" : "text-sm text-muted-foreground"}>{label}</span>
      <span
        className={
          negative
            ? emphasis
              ? "text-xl font-semibold tabular-nums text-destructive"
              : "text-sm font-medium tabular-nums text-destructive"
            : emphasis
              ? "text-xl font-semibold tabular-nums text-foreground"
              : "text-sm font-medium tabular-nums text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

function MaterialPlanningRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={emphasis ? "text-sm font-semibold tabular-nums text-destructive" : "text-sm font-semibold tabular-nums text-foreground"}>
        {value}
      </span>
    </div>
  );
}

function MaterialSummaryItem({
  materialName,
  unitLabel,
  planning,
}: {
  materialName: string;
  unitLabel: string;
  planning: MaterialPlanning;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsPurchase = Boolean(planning.remainingToBuy && planning.remainingToBuy > 0);

  return (
    <div>
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="flex w-full items-center gap-3 py-2.5 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{materialName}</p>
          <p className="text-xs text-muted-foreground">
            Disponível {formatQuantity(planning.available)} {unitLabel}
          </p>
        </div>
        {needsPurchase ? (
          <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">Falta comprar</span>
        ) : null}
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden="true" />
      </button>

      {expanded ? (
        <div className="space-y-1.5 pb-3">
          <MaterialPlanningRow label="Necessário" value={`${formatQuantity(planning.required ?? 0)} ${unitLabel}`} />
          <MaterialPlanningRow
            label="Comprado"
            value={`${formatQuantity(planning.purchased)} ${unitLabel}${
              planning.purchasedExcess && planning.purchasedExcess > 0 ? ` (excesso de ${formatQuantity(planning.purchasedExcess)} ${unitLabel})` : ""
            }`}
          />
          <MaterialPlanningRow
            label="Recebido"
            value={`${formatQuantity(planning.received)} ${unitLabel}${
              planning.receivedExcess && planning.receivedExcess > 0 ? ` (excesso de ${formatQuantity(planning.receivedExcess)} ${unitLabel})` : ""
            }`}
          />
          <MaterialPlanningRow label="Utilizado" value={`${formatQuantity(planning.consumed)} ${unitLabel}`} />
          <MaterialPlanningRow label="Disponível" value={`${formatQuantity(planning.available)} ${unitLabel}`} />
          <MaterialPlanningRow label="Falta comprar" value={`${formatQuantity(planning.remainingToBuy ?? 0)} ${unitLabel}`} emphasis={needsPurchase} />
          <MaterialPlanningRow
            label="Falta receber"
            value={`${formatQuantity(planning.remainingToReceive)} ${unitLabel}`}
            emphasis={planning.remainingToReceive > 0}
          />
        </div>
      ) : null}
    </div>
  );
}

function addressLines(address: Project["address"]): string[] {
  if (!address) return [];
  const lines: string[] = [];
  const streetLine = [address.street, address.number].filter(Boolean).join(", ");
  if (streetLine) lines.push(streetLine);
  if (address.complement) lines.push(address.complement);
  const cityLine = [address.neighborhood, address.city && address.state ? `${address.city}/${address.state}` : address.city]
    .filter(Boolean)
    .join(" · ");
  if (cityLine) lines.push(cityLine);
  if (address.postal_code) lines.push(formatCep(address.postal_code));
  if (address.reference_point) lines.push(address.reference_point);
  return lines;
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">Carregando obra</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
  );
}

export function ProjectDetail({ id }: { id: string }) {
  const router = useRouter();
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<"loading" | "success" | "not_found" | "error">("loading");
  const [project, setProject] = useState<Project | null>(null);
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | undefined>(undefined);
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | undefined>(undefined);
  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [statusActionError, setStatusActionError] = useState<string | null>(null);

  const { costs } = useProjectCosts(id);
  const [payables, setPayables] = useState<Payable[] | undefined>(undefined);
  const [receivables, setReceivables] = useState<Receivable[] | undefined>(undefined);
  const [receipts, setReceipts] = useState<ReceiptModel[] | undefined>(undefined);
  const { requirements, error: requirementsError, reload: reloadRequirements } = useMaterialRequirements(id);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[] | undefined>(undefined);
  const [purchaseOrderItems, setPurchaseOrderItems] = useState<PurchaseOrderItem[] | undefined>(undefined);
  const [purchaseReceiptItems, setPurchaseReceiptItems] = useState<GoodsReceiptItem[] | undefined>(undefined);
  const [purchaseConsumptions, setPurchaseConsumptions] = useState<MaterialConsumption[] | undefined>(undefined);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  const currentIdRef = useRef(id);
  // FRONTEND-PROJECTS-01A §19: written via useLayoutEffect (not
  // useEffect) — a status-PUT/409-refresh promise continuation for the
  // OLD Company/Project id resolves as a microtask, which can run
  // between commit and passive effects; the live ref must already
  // reflect the NEW Company/id by then, or a stale continuation would
  // wrongly conclude it's still current.
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    currentIdRef.current = id;
  }, [activeCompanyId, id]);

  function isStale(requestCompanyId: string | undefined, requestId: string) {
    return activeCompanyIdRef.current !== requestCompanyId || currentIdRef.current !== requestId;
  }

  const load = useCallback(async () => {
    const seq = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    const requestProjectId = id;
    setStatus("loading");
    setStatusActionError(null);
    try {
      const data = await getProject(id);
      if (requestSequence.current !== seq) return;
      if (isStale(requestCompanyId, requestProjectId)) return;
      setProject(data);
      setLoadedCompanyId(requestCompanyId);
      setResolvedCompanyId(requestCompanyId);
      setStatus("success");
    } catch (error) {
      if (requestSequence.current !== seq) return;
      if (isStale(requestCompanyId, requestProjectId)) return;
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

  useEffect(() => {
    const projectReceivables = listReceivablesByProject(id);
    const projectPurchaseOrders = listPurchaseOrdersByProject(id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPayables(listPayablesByProject(id));
    setReceivables(projectReceivables);
    setReceipts(projectReceivables.flatMap((receivable) => listReceiptsByReceivable(receivable.id)));
    setPurchaseOrders(projectPurchaseOrders);
    setPurchaseOrderItems(listItemsByPurchaseOrders(projectPurchaseOrders.map((purchaseOrder) => purchaseOrder.id)));
    setPurchaseConsumptions(listConsumptionsByProject(id));
    setPurchaseReceiptItems(projectPurchaseOrders.flatMap((purchaseOrder) => listReceiptItemsByPurchaseOrder(purchaseOrder.id)));
  }, [id]);

  /**
   * §37: re-fetches the Project WITHOUT touching `status`/`statusActionError`
   * — unlike `load()` (a full reload for the initial mount/retry path),
   * this never flips the screen back to the loading skeleton, so the
   * conflict notice set by the caller stays visible while the fresh data
   * replaces the stale Project underneath it.
   */
  async function refreshAfterConflict(requestCompanyId: string | undefined, requestProjectId: string) {
    try {
      const data = await getProject(requestProjectId);
      if (isStale(requestCompanyId, requestProjectId)) return;
      setProject(data);
    } catch {
      // The conflict message already surfaced; a failed silent refresh
      // here is secondary and never replaces it with a second,
      // contradicting error.
    }
  }

  /**
   * §37: a status PUT that comes back 409 does NOT overwrite local state
   * — there's no open edit draft on this page to protect, so the
   * accepted behavior is to just refetch the truth and show a short
   * notice, never a silent retry.
   */
  async function handleStatusChange(nextStatus: ProjectStatus) {
    if (!project || project.status === nextStatus) return;
    const requestCompanyId = activeCompanyId;
    const requestProjectId = project.id;
    setStatusActionLoading(true);
    setStatusActionError(null);
    try {
      const updated = await updateProject(project.id, { updated_at: project.updated_at, status: nextStatus });
      if (isStale(requestCompanyId, requestProjectId)) return;
      setProject(updated);
    } catch (error) {
      if (isStale(requestCompanyId, requestProjectId)) return;
      if (error instanceof ApiError && error.status === 409) {
        setStatusActionError("A obra foi alterada por outra pessoa. Os dados foram atualizados.");
        void refreshAfterConflict(requestCompanyId, requestProjectId);
      } else {
        setStatusActionError("Não foi possível atualizar o status agora.");
      }
    } finally {
      if (!isStale(requestCompanyId, requestProjectId)) setStatusActionLoading(false);
    }
  }

  const isCurrentTenant = project !== null && loadedCompanyId === activeCompanyId;
  const isResolvedForCurrentTenant = resolvedCompanyId !== undefined && resolvedCompanyId === activeCompanyId;

  if (status === "error" && isResolvedForCurrentTenant) {
    return (
      <div className="space-y-4">
        <BackLink href="/obras" title="Obra" icon={Building2} />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar esta obra agora.
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
        <BackLink href="/obras" title="Obra" icon={Building2} />
        <EmptyState icon={FileText} title="Obra não encontrada" description="Ela pode ter sido removida ou o link está incorreto." />
      </div>
    );
  }

  if (!isCurrentTenant || status === "loading" || !project) {
    return (
      <div className="space-y-4">
        <BackLink href="/obras" title="Obra" icon={Building2} />
        <DetailSkeleton />
      </div>
    );
  }

  const registeredCost = costs ? sumCosts(costs) : 0;
  const referenceAmount = project.source_budget ? Number(project.source_budget.total) : null;
  const summary =
    costs !== undefined && payables !== undefined && receivables !== undefined && receipts !== undefined
      ? buildProjectManagementSummary({ projectId: project.id, referenceAmount, costs, payables, receivables, receipts })
      : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/obras")}
            aria-label="Voltar"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Building2 className="size-5" aria-hidden="true" />
          </button>
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-foreground">
            {project.number} · {project.name}
          </h1>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="space-y-0.5 pl-11">
          <Link href={`/clientes/${project.customer.id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            {project.customer.name}
            <ExternalLink className="size-3" aria-hidden="true" />
          </Link>
          {project.reference ? <p className="text-sm text-muted-foreground">{project.reference}</p> : null}
          {addressLines(project.address).map((line, index) => (
            <p key={index} className="text-sm text-muted-foreground">
              {line}
            </p>
          ))}
          {project.expected_end_date ? (
            <p className={isProjectLate(project, todayIso()) ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
              {isProjectLate(project, todayIso())
                ? `Atrasada ${projectDaysLate(project, todayIso())} dia${projectDaysLate(project, todayIso()) === 1 ? "" : "s"}`
                : `Conclusão prevista: ${civilDateToBrDisplay(project.expected_end_date)}`}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Atualizado em {civilDateToBrDisplay(project.updated_at.slice(0, 10)) ?? "—"}</p>
        <Link href={`/obras/${project.id}/editar`} className="text-xs font-medium text-primary hover:underline">
          Editar obra
        </Link>
      </div>

      <section aria-labelledby="project-summary" className="space-y-2.5">
        <h2 id="project-summary" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Visão geral
        </h2>
        <div className="rounded-xl border border-border bg-card p-4">
          {summary === null ? (
            <InfoRow label="Custo realizado" value={formatCurrency(registeredCost)} emphasis />
          ) : (
            <>
              {summary.referenceAmount !== null ? <InfoRow label="Valor do orçamento" value={formatCurrency(summary.referenceAmount)} emphasis /> : null}
              <div className={summary.referenceAmount !== null ? "mt-2 border-t border-border pt-2" : undefined}>
                <InfoRow label="Custo realizado" value={formatCurrency(summary.realizedCost)} emphasis={summary.referenceAmount === null} />
              </div>
              {summary.pendingPayables > 0 ? <InfoRow label="Compromissos (contas a pagar)" value={formatCurrency(summary.pendingPayables)} /> : null}
              {summary.referenceAmount !== null ? (
                <InfoRow label="Diferença para o orçamento" value={formatCurrency(summary.remainingAgainstBudget ?? 0)} negative={(summary.remainingAgainstBudget ?? 0) < 0} />
              ) : null}
              {summary.referenceAmount !== null && summary.pendingPayables > 0 ? (
                <InfoRow
                  label="Diferença após compromissos"
                  value={formatCurrency(summary.committedRemainingAgainstBudget ?? 0)}
                  negative={(summary.committedRemainingAgainstBudget ?? 0) < 0}
                />
              ) : null}
            </>
          )}
        </div>
      </section>

      {summary && summary.alerts.length > 0 ? (
        <div className="space-y-2">
          {summary.alerts.map((alert, index) => {
            const Icon = alert.severity === "info" ? Info : AlertTriangle;
            const className =
              alert.severity === "critical"
                ? "flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                : alert.severity === "warning"
                  ? "flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400"
                  : "flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground";
            return (
              <div key={index} className={className}>
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{alert.message}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {statusActionError ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {statusActionError}
        </p>
      ) : null}

      <div className="space-y-2">
        <span className="text-sm font-medium text-foreground">Status</span>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((candidateStatus) => {
            const selected = project.status === candidateStatus;
            return (
              <button
                key={candidateStatus}
                type="button"
                aria-pressed={selected}
                disabled={statusActionLoading}
                onClick={() => void handleStatusChange(candidateStatus)}
                className={
                  selected
                    ? "rounded-lg border border-primary bg-primary/5 py-2.5 text-sm font-semibold text-primary disabled:opacity-60"
                    : "rounded-lg border border-border bg-card py-2.5 text-sm font-semibold text-foreground hover:border-primary/30 disabled:opacity-60"
                }
              >
                {PROJECT_STATUS_LABEL[candidateStatus]}
              </button>
            );
          })}
        </div>
      </div>

      <section aria-labelledby="project-budget" className="space-y-2.5">
        <h2 id="project-budget" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Orçamento de origem
        </h2>
        {project.source_budget ? (
          <Link
            href={`/orcamentos/${project.source_budget.id}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{project.source_budget.number}</p>
              <p className="text-sm font-semibold text-foreground">{decimalStringToBrlDisplay(project.source_budget.total)}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        ) : (
          <EmptyState icon={FileText} title="Sem orçamento vinculado" description="Esta obra foi criada manualmente." />
        )}
      </section>

      <section aria-labelledby="project-costs" className="space-y-2.5">
        <h2 id="project-costs" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Custos da obra
        </h2>
        {costs === undefined ? null : costs.length > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div>
              <p className="text-xs text-muted-foreground">Registrado</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">{formatCurrency(registeredCost)}</p>
            </div>
            <Button variant="outline" nativeButton={false} render={<Link href={`/obras/${project.id}/custos`}>Ver custos</Link>} />
          </div>
        ) : (
          <div className="space-y-3">
            <EmptyState compact icon={Receipt} title="Nenhum custo registrado" description="Registre materiais, serviços e outras despesas da obra." />
            <Button variant="outline" className="w-full" nativeButton={false} render={<Link href={`/obras/${project.id}/custos/novo`}>Registrar custo</Link>} />
          </div>
        )}
      </section>

      {summary && summary.costsByCategory.length > 0 ? (
        <section aria-labelledby="project-costs-by-category" className="space-y-2.5">
          <h2 id="project-costs-by-category" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Custos por categoria
          </h2>
          <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
            {summary.costsByCategory.map((entry) => (
              <div key={entry.category} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-muted-foreground">{PROJECT_COST_CATEGORY_LABEL[entry.category]}</span>
                <span className="text-sm font-medium tabular-nums text-foreground">{formatCurrency(entry.amount)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="project-team" className="space-y-2.5">
        <h2 id="project-team" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Equipe da obra
        </h2>
        <ProjectTeamSummary project={project} />
      </section>

      <section aria-labelledby="project-materials" className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="project-materials" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Materiais
          </h2>
        </div>
        {requirementsError ? (
          <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
            <p role="alert" className="text-sm text-muted-foreground">
              Não foi possível carregar as necessidades de materiais agora.
            </p>
            <Button type="button" onClick={reloadRequirements}>
              Tentar novamente
            </Button>
          </div>
        ) : requirements === undefined || purchaseOrders === undefined || purchaseOrderItems === undefined || purchaseReceiptItems === undefined || purchaseConsumptions === undefined ? null : requirements.length > 0 ? (
          <div className="space-y-3">
            <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
              {requirements.map((requirement) => {
                const planning = calculateMaterialPlanning(
                  requirementQuantityForLegacyPlanning(requirement.required_quantity),
                  purchaseOrders,
                  purchaseOrderItems,
                  purchaseReceiptItems,
                  purchaseConsumptions,
                  requirement.material.id
                );
                const unitLabel = formatMaterialUnitCode(requirement.material.unit_code, requirement.material.unit_custom_label);
                return (
                  <MaterialSummaryItem
                    key={requirement.id}
                    materialName={requirement.material.name}
                    unitLabel={unitLabel}
                    planning={planning}
                  />
                );
              })}
            </div>
            <Button variant="outline" className="w-full" nativeButton={false} render={<Link href={`/obras/${project.id}/materiais`}>Gerenciar materiais</Link>} />
          </div>
        ) : (
          <div className="space-y-3">
            <EmptyState compact icon={Receipt} title="Nenhum material planejado" description="Registre a quantidade necessária de cada material desta obra." />
            <Button variant="outline" className="w-full" nativeButton={false} render={<Link href={`/obras/${project.id}/materiais`}>Gerenciar materiais</Link>} />
          </div>
        )}
      </section>

      <section aria-labelledby="project-purchases" className="space-y-2.5">
        <h2 id="project-purchases" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Compras
        </h2>
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Pedidos realizados</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(
                  purchaseOrders !== undefined && purchaseOrderItems !== undefined
                    ? calculatePurchaseOrderTotal(
                        purchaseOrderItems.filter((item) =>
                          purchaseOrders.some((purchaseOrder) => purchaseOrder.id === item.purchaseOrderId && purchaseOrder.commercialStatus === "ordered")
                        )
                      )
                    : 0
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Entregas pendentes</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {purchaseOrders === undefined || purchaseOrderItems === undefined || purchaseReceiptItems === undefined
                  ? 0
                  : purchaseOrders.filter((purchaseOrder) => {
                      if (purchaseOrder.commercialStatus !== "ordered") return false;
                      const orderItems = purchaseOrderItems.filter((item) => item.purchaseOrderId === purchaseOrder.id);
                      return calculatePurchaseOrderFulfillment(orderItems, purchaseReceiptItems) !== "received";
                    }).length}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rascunhos</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {purchaseOrders?.filter((purchaseOrder) => purchaseOrder.commercialStatus === "draft").length ?? 0}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href={`/compras?projectId=${project.id}`}>Ver compras</Link>} />
            <Button variant="outline" nativeButton={false} render={<Link href={`/compras/nova?projectId=${project.id}`}>Nova compra</Link>} />
          </div>
        </div>
      </section>

      {summary ? (
        <section aria-labelledby="project-financial" className="space-y-2.5">
          <h2 id="project-financial" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Financeiro
          </h2>
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">A pagar</p>
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-6">
                <div>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(summary.pendingPayables)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vencidas</p>
                  <p className={summary.overduePayables > 0 ? "text-sm font-semibold tabular-nums text-destructive" : "text-sm font-semibold tabular-nums text-foreground"}>
                    {formatCurrency(summary.overduePayables)}
                  </p>
                </div>
              </div>
              <Button variant="outline" nativeButton={false} render={<Link href={`/financeiro/contas-a-pagar?projectId=${project.id}`}>Ver contas a pagar</Link>} />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">A receber</p>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Recebido</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(summary.receivableReceived)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">A receber</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(summary.receivableOutstanding)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vencido</p>
                <p className={summary.receivableOverdue > 0 ? "text-sm font-semibold tabular-nums text-destructive" : "text-sm font-semibold tabular-nums text-foreground"}>
                  {formatCurrency(summary.receivableOverdue)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" nativeButton={false} render={<Link href={`/financeiro/contas-a-receber?projectId=${project.id}`}>Ver contas a receber</Link>} />
              <Button variant="outline" nativeButton={false} render={<Link href={`/financeiro/contas-a-receber/nova?projectId=${project.id}`}>Adicionar conta</Link>} />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
