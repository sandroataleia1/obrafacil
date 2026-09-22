"use client";

/**
 * SUPPLY-FRONTEND-01D §37/§61. Quantities/planning now come from
 * `StockPosition` (`listAllStockPositions({ projectId })`, real API) —
 * no more local `calculateMaterialPlanning`/Purchase fan-out/local
 * Consumption store. `useMaterialRequirements` stays (already real API)
 * — it is used here only to resolve a Requirement's own id for the
 * "Editar necessidade" link, not for planning math; §61 only forbids
 * that fan-out in StockList/StockDetail/ConsumptionForm/AdjustStockForm.
 * Consumption history per Material comes from `StockMovement`
 * (`listStockMovements`, filtered to `source_type === "CONSUMPTION"`)
 * fetched on demand when a card's history is expanded — there is no
 * standalone GET Consumption (§12); delete uses `movement.source_id`.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Package, Pencil, Plus, Trash2 } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/date";
import { useProject } from "@/features/projects/use-project";
import { deleteMaterialConsumption, listAllStockPositions, listStockMovements } from "@/features/stock/stock-client";
import { formatStockQuantity } from "@/features/stock/stock-decimal";
import type { StockMovement, StockPosition } from "@/features/stock/types";
import { formatMaterialUnitCode } from "./material-unit";
import { useMaterialRequirements } from "./use-material-requirements";
import type { MaterialRequirement } from "./types";

function PlanningRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={
          emphasis
            ? "text-sm font-semibold tabular-nums text-destructive"
            : "text-sm font-semibold tabular-nums text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

function ConsumptionHistory({
  loading,
  error,
  movements,
  unitLabel,
  onDelete,
  deletingId,
}: {
  loading: boolean;
  error: boolean;
  movements: StockMovement[];
  unitLabel: string;
  onDelete: (movement: StockMovement) => void;
  deletingId: string | null;
}) {
  if (error) {
    return <p className="py-2 text-xs text-destructive">Não foi possível carregar o histórico agora.</p>;
  }
  if (loading) return null;
  if (movements.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">Nenhum uso registrado ainda.</p>;
  }

  return (
    <div className="divide-y divide-border">
      {movements.map((movement) => (
        <div key={movement.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {formatStockQuantity(movement.quantity)} {unitLabel}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {formatDate(movement.occurred_at)}
              {movement.note ? ` · ${movement.note}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDelete(movement)}
            disabled={deletingId === movement.id}
            aria-label="Excluir uso"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

function MaterialPlanningCard({
  projectId,
  position,
  requirement,
  onConsumptionDeleted,
}: {
  projectId: string;
  position: StockPosition;
  requirement: MaterialRequirement | null;
  onConsumptionDeleted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [movements, setMovements] = useState<StockMovement[] | undefined>(undefined);
  const [movementsError, setMovementsError] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const materialId = position.material.id;
  const unitLabel = formatMaterialUnitCode(position.material.unit_code, position.material.unit_custom_label);
  const needsPurchase = position.missing_to_purchase_quantity !== null && Number(position.missing_to_purchase_quantity) > 0;

  function loadMovements() {
    setMovementsError(false);
    setMovements(undefined);
    listStockMovements(projectId, materialId, { perPage: 100 })
      .then((response) => setMovements(response.data.filter((movement) => movement.source_type === "CONSUMPTION")))
      .catch(() => setMovementsError(true));
  }

  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && movements === undefined && !movementsError) loadMovements();
  }

  async function handleDeleteConsumption(movement: StockMovement) {
    const confirmed = window.confirm("Excluir este registro de uso? Esta ação não pode ser desfeita.");
    if (!confirmed) return;
    setDeletingId(movement.id);
    try {
      await deleteMaterialConsumption(movement.project_id, movement.source_id);
      setDeletingId(null);
      loadMovements();
      onConsumptionDeleted();
    } catch {
      setDeletingId(null);
      window.alert("Não foi possível excluir este uso agora. Tente novamente.");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {position.material.name}
            {!position.material.active ? (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">(inativo)</span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            Disponível {formatStockQuantity(position.stock_quantity)} {unitLabel}
          </p>
        </div>
        {needsPurchase ? (
          <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            Falta comprar
          </span>
        ) : null}
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-border px-4 pt-3 pb-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted-foreground">{unitLabel}</p>
            {requirement ? (
              <Link
                href={`/obras/${projectId}/materiais/${requirement.id}/editar`}
                aria-label="Editar necessidade"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </Link>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <PlanningRow
              label="Necessário"
              value={
                position.required_quantity === null
                  ? "Não planejado"
                  : `${formatStockQuantity(position.required_quantity)} ${unitLabel}`
              }
            />
            <PlanningRow label="Comprado" value={`${formatStockQuantity(position.purchased_quantity)} ${unitLabel}`} />
            <PlanningRow label="Recebido" value={`${formatStockQuantity(position.received_quantity)} ${unitLabel}`} />
            <PlanningRow label="Utilizado" value={`${formatStockQuantity(position.consumed_quantity)} ${unitLabel}`} />
            <PlanningRow label="Disponível" value={`${formatStockQuantity(position.stock_quantity)} ${unitLabel}`} />
            <PlanningRow
              label="Falta comprar"
              value={
                position.missing_to_purchase_quantity === null
                  ? "—"
                  : `${formatStockQuantity(position.missing_to_purchase_quantity)} ${unitLabel}`
              }
              emphasis={needsPurchase}
            />
            <PlanningRow
              label="Falta receber"
              value={`${formatStockQuantity(position.pending_receipt_quantity)} ${unitLabel}`}
              emphasis={Number(position.pending_receipt_quantity) > 0}
            />
          </div>

          <div className="flex items-center gap-2">
            {Number(position.stock_quantity) > 0 ? (
              <Button
                size="sm"
                className="flex-1"
                nativeButton={false}
                render={<Link href={`/obras/${projectId}/materiais/uso/${materialId}/novo`}>Registrar uso</Link>}
              />
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={Number(position.stock_quantity) > 0 ? "" : "flex-1"}
              onClick={toggleHistory}
            >
              {historyOpen ? (
                <ChevronUp className="size-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="size-3.5" aria-hidden="true" />
              )}
              Histórico{movements ? ` (${movements.length})` : ""}
            </Button>
          </div>

          {historyOpen ? (
            <div className="border-t border-border">
              <ConsumptionHistory
                loading={movements === undefined && !movementsError}
                error={movementsError}
                movements={movements ?? []}
                unitLabel={unitLabel}
                onDelete={(movement) => void handleDeleteConsumption(movement)}
                deletingId={deletingId}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProjectRequirementList({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { project, error: projectError, reload: reloadProject } = useProject(projectId);
  const { requirements, error: requirementsError, reload: reloadRequirements } = useMaterialRequirements(projectId);
  const [positions, setPositions] = useState<StockPosition[] | undefined>(undefined);
  const [positionsError, setPositionsError] = useState(false);

  function loadPositions() {
    setPositionsError(false);
    listAllStockPositions({ projectId })
      .then((data) => setPositions(data))
      .catch(() => setPositionsError(true));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPositions(undefined);
    loadPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (projectError) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          Não foi possível carregar esta obra agora.
        </p>
        <Button type="button" onClick={reloadProject}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (project === undefined) return null;

  if (project === null) {
    return (
      <EmptyState
        icon={Package}
        title="Obra não encontrada"
        description="Ela pode ter sido removida ou o link está incorreto."
      />
    );
  }

  const dataReady = requirements !== undefined && positions !== undefined;

  const requirementByMaterial = new Map((requirements ?? []).map((requirement) => [requirement.material.id, requirement]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <BackHeader title="Materiais da obra" onBack={() => router.push(`/obras/${projectId}`)} />
          <p className="pl-11 text-sm text-muted-foreground">{project.name}</p>
        </div>
        <Button
          size="sm"
          className="mt-1"
          nativeButton={false}
          render={
            <Link href={`/obras/${projectId}/materiais/novo`}>
              <Plus className="size-4" aria-hidden="true" />
              Adicionar
            </Link>
          }
        />
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
      ) : positionsError ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar os materiais desta obra agora.
          </p>
          <Button type="button" onClick={loadPositions}>
            Tentar novamente
          </Button>
        </div>
      ) : !dataReady ? null : positions.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon={Package}
            title="Nenhum material planejado"
            description="Registre a quantidade necessária de cada material para esta obra."
          />
          <Button
            size="lg"
            className="w-full"
            nativeButton={false}
            render={<Link href={`/obras/${projectId}/materiais/novo`}>Adicionar material</Link>}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {positions.map((position) => (
            <MaterialPlanningCard
              key={position.material.id}
              projectId={projectId}
              position={position}
              requirement={requirementByMaterial.get(position.material.id) ?? null}
              onConsumptionDeleted={loadPositions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
