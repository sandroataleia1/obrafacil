"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Package, Pencil, Plus, Trash2 } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/date";
import { formatQuantity } from "@/lib/quantity";
import { useProject } from "@/features/projects/prototype/use-project";
import { listReceiptItemsByPurchaseOrder } from "@/features/purchases/prototype/goods-receipt-item-store";
import { listPurchaseOrdersByProject } from "@/features/purchases/prototype/purchase-order-store";
import { listItemsByPurchaseOrders } from "@/features/purchases/prototype/purchase-order-item-store";
import { calculateMaterialPlanning, type MaterialPlanning } from "@/features/purchases/prototype/purchase-totals";
import type { GoodsReceiptItem, PurchaseOrder, PurchaseOrderItem } from "@/features/purchases/types";
import { formatMaterialUnit } from "./material-unit";
import { getMaterial } from "./prototype/material-store";
import { listConsumptionsByProject } from "./prototype/material-consumption-store";
import { removeMaterialConsumption } from "./prototype/material-consumption";
import { useRequirements } from "./prototype/use-requirements";
import type { Material, MaterialConsumption, MaterialRequirement } from "./types";

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
  consumptions,
  unitLabel,
  onDelete,
}: {
  consumptions: MaterialConsumption[];
  unitLabel: string;
  onDelete: (consumption: MaterialConsumption) => void;
}) {
  if (consumptions.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">Nenhum uso registrado ainda.</p>;
  }

  return (
    <div className="divide-y divide-border">
      {consumptions.map((consumption) => (
        <div key={consumption.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {formatQuantity(consumption.quantity)} {unitLabel}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {formatDate(consumption.consumedAt)}
              {consumption.notes ? ` · ${consumption.notes}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDelete(consumption)}
            aria-label="Excluir uso"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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
  materialId,
  material,
  requirement,
  planning,
  consumptions,
  onDeleteConsumption,
}: {
  projectId: string;
  materialId: string;
  material: Material | null;
  requirement: MaterialRequirement | null;
  planning: MaterialPlanning;
  consumptions: MaterialConsumption[];
  onDeleteConsumption: (consumption: MaterialConsumption) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const unitLabel = material ? formatMaterialUnit(material.defaultUnit) : "";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {material?.name ?? "Material não encontrado"}
            {material?.status === "inactive" ? (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">(inativo)</span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">{unitLabel}</p>
        </div>
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

      <div className="mt-3 space-y-1.5">
        <PlanningRow
          label="Necessário"
          value={planning.required === null ? "Não planejado" : `${formatQuantity(planning.required)} ${unitLabel}`}
        />
        <PlanningRow
          label="Comprado"
          value={`${formatQuantity(planning.purchased)} ${unitLabel}${
            planning.purchasedExcess && planning.purchasedExcess > 0
              ? ` (excesso de ${formatQuantity(planning.purchasedExcess)} ${unitLabel})`
              : ""
          }`}
        />
        <PlanningRow
          label="Recebido"
          value={`${formatQuantity(planning.received)} ${unitLabel}${
            planning.receivedExcess && planning.receivedExcess > 0
              ? ` (excesso de ${formatQuantity(planning.receivedExcess)} ${unitLabel})`
              : ""
          }`}
        />
        <PlanningRow label="Utilizado" value={`${formatQuantity(planning.consumed)} ${unitLabel}`} />
        <PlanningRow label="Disponível" value={`${formatQuantity(planning.available)} ${unitLabel}`} />
        <PlanningRow
          label="Falta comprar"
          value={planning.remainingToBuy === null ? "—" : `${formatQuantity(planning.remainingToBuy)} ${unitLabel}`}
          emphasis={Boolean(planning.remainingToBuy && planning.remainingToBuy > 0)}
        />
        <PlanningRow
          label="Falta receber"
          value={`${formatQuantity(planning.remainingToReceive)} ${unitLabel}`}
          emphasis={planning.remainingToReceive > 0}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        {planning.available > 0 ? (
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
          className={planning.available > 0 ? "" : "flex-1"}
          onClick={() => setHistoryOpen((open) => !open)}
        >
          {historyOpen ? (
            <ChevronUp className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3.5" aria-hidden="true" />
          )}
          Histórico ({consumptions.length})
        </Button>
      </div>

      {historyOpen ? (
        <div className="mt-2 border-t border-border">
          <ConsumptionHistory
            consumptions={consumptions}
            unitLabel={unitLabel}
            onDelete={onDeleteConsumption}
          />
        </div>
      ) : null}
    </div>
  );
}

export function ProjectRequirementList({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { project } = useProject(projectId);
  const { requirements } = useRequirements(projectId);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[] | undefined>(undefined);
  const [purchaseOrderItems, setPurchaseOrderItems] = useState<PurchaseOrderItem[] | undefined>(
    undefined
  );
  const [receiptItems, setReceiptItems] = useState<GoodsReceiptItem[] | undefined>(undefined);
  const [consumptions, setConsumptions] = useState<MaterialConsumption[] | undefined>(undefined);

  function refreshConsumptions() {
    setConsumptions(listConsumptionsByProject(projectId));
  }

  useEffect(() => {
    const projectPurchaseOrders = listPurchaseOrdersByProject(projectId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPurchaseOrders(projectPurchaseOrders);
    setPurchaseOrderItems(
      listItemsByPurchaseOrders(projectPurchaseOrders.map((purchaseOrder) => purchaseOrder.id))
    );
    setReceiptItems(
      projectPurchaseOrders.flatMap((purchaseOrder) =>
        listReceiptItemsByPurchaseOrder(purchaseOrder.id)
      )
    );
    setConsumptions(listConsumptionsByProject(projectId));
  }, [projectId]);

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

  function handleDeleteConsumption(consumption: MaterialConsumption) {
    const confirmed = window.confirm("Excluir este registro de uso? Esta ação não pode ser desfeita.");
    if (!confirmed) return;
    removeMaterialConsumption(consumption);
    refreshConsumptions();
  }

  const dataReady =
    requirements !== undefined &&
    purchaseOrders !== undefined &&
    purchaseOrderItems !== undefined &&
    receiptItems !== undefined &&
    consumptions !== undefined;

  // Union of every Material relevant to this Obra — planned (has a
  // MaterialRequirement) and/or purchased (appears in a PurchaseOrderItem
  // of an order for this Obra). A Material bought without ever being
  // planned must still show up here (see Task 042 spec) — it just shows
  // "Não planejado" instead of a required quantity.
  const requirementByMaterial = new Map(
    (requirements ?? []).map((requirement) => [requirement.materialId, requirement])
  );
  const materialIds = new Set<string>([
    ...requirementByMaterial.keys(),
    ...(purchaseOrderItems ?? []).map((item) => item.materialId),
  ]);

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

      {!dataReady ? null : materialIds.size === 0 ? (
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
          {Array.from(materialIds).map((materialId) => {
            const requirement = requirementByMaterial.get(materialId) ?? null;
            const planning = calculateMaterialPlanning(
              requirement?.requiredQuantity ?? null,
              purchaseOrders!,
              purchaseOrderItems!,
              receiptItems!,
              consumptions!,
              materialId
            );
            const materialConsumptions = consumptions!.filter((c) => c.materialId === materialId);
            return (
              <MaterialPlanningCard
                key={materialId}
                projectId={projectId}
                materialId={materialId}
                material={getMaterial(materialId)}
                requirement={requirement}
                planning={planning}
                consumptions={materialConsumptions}
                onDeleteConsumption={handleDeleteConsumption}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
