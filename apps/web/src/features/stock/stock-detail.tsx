"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Boxes } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatQuantity } from "@/lib/quantity";
import { formatDate } from "@/lib/date";
import { getMaterial } from "@/features/materials/prototype/material-store";
import { formatMaterialUnit } from "@/features/materials/material-unit";
import { getProject } from "@/features/projects/prototype/project-store";
import { getGoodsReceipt } from "@/features/purchases/prototype/goods-receipt-store";
import { useStockDetail } from "./prototype/use-stock-detail";
import { getProjectMaterialSupplyMetrics } from "./prototype/supply-metrics";
import { STOCK_MOVEMENT_SOURCE_LABEL, type StockMovement } from "./types";
import { StockMovementTypeBadge } from "./components/movement-type-badge";

function InfoField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="truncate text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function movementOrigin(movement: StockMovement): ReactNode {
  if (movement.sourceType === "GOODS_RECEIPT") {
    const goodsReceipt = getGoodsReceipt(movement.sourceId);
    if (goodsReceipt) {
      return (
        <Link href={`/compras/${goodsReceipt.purchaseOrderId}`} className="text-primary hover:underline">
          {STOCK_MOVEMENT_SOURCE_LABEL.GOODS_RECEIPT}
        </Link>
      );
    }
    return STOCK_MOVEMENT_SOURCE_LABEL.GOODS_RECEIPT;
  }
  if (movement.sourceType === "CONSUMPTION") {
    return STOCK_MOVEMENT_SOURCE_LABEL.CONSUMPTION;
  }
  return STOCK_MOVEMENT_SOURCE_LABEL.MANUAL_ADJUSTMENT;
}

function MovementRow({ movement, unitLabel }: { movement: StockMovement; unitLabel: string }) {
  const isEntry = movement.type === "IN" || movement.type === "ADJUSTMENT_IN";
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-foreground">{formatDate(movement.occurredAt)}</p>
        <p className="truncate text-xs text-muted-foreground">{movementOrigin(movement)}</p>
        {movement.note ? <p className="truncate text-xs text-muted-foreground">{movement.note}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StockMovementTypeBadge type={movement.type} className="hidden sm:inline-flex" />
        <span
          className={
            isEntry
              ? "text-sm font-semibold tabular-nums text-primary"
              : "text-sm font-semibold tabular-nums text-destructive"
          }
        >
          {isEntry ? "+" : "−"} {formatQuantity(movement.quantity)} {unitLabel}
        </span>
      </div>
    </div>
  );
}

export function StockDetail({ projectId, materialId }: { projectId: string; materialId: string }) {
  const { movements, totals } = useStockDetail(projectId, materialId);

  const project = getProject(projectId);
  const material = getMaterial(materialId);

  if (!project || !material) {
    return (
      <div className="space-y-6">
        <BackLink icon={Boxes} title="Estoque" href="/estoque" />
        <EmptyState
          icon={Boxes}
          title="Estoque não encontrado"
          description="A obra ou o material podem ter sido removidos."
        />
      </div>
    );
  }

  const unitLabel = formatMaterialUnit(material.defaultUnit);
  const subtitle = project.name;
  const supply = getProjectMaterialSupplyMetrics(projectId, materialId);
  const withUnit = (value: number) => `${formatQuantity(value)} ${unitLabel}`;

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="space-y-1">
        <BackLink icon={Boxes} title={material.name} href="/estoque" />
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <span className="mb-1 block text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Saldo atual
        </span>
        <p className="text-3xl font-semibold tabular-nums text-foreground">
          {totals ? formatQuantity(totals.balance) : "—"} {unitLabel}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <span className="mb-3 block text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Informações
        </span>
        <div className="grid grid-cols-2 gap-4">
          <InfoField label="Material" value={material.name} />
          <InfoField
            label="Obra"
            value={
              <Link href={`/obras/${project.id}`} className="text-primary hover:underline">
                {project.name}
              </Link>
            }
          />
          <InfoField label="Unidade" value={unitLabel} />
          <InfoField
            label="Total de entradas"
            value={<span className="tabular-nums text-primary">+{totals ? formatQuantity(totals.totalIn) : "—"}</span>}
          />
          <InfoField
            label="Total de saídas"
            value={
              <span className="tabular-nums text-destructive">
                −{totals ? formatQuantity(totals.totalOut) : "—"}
              </span>
            }
          />
        </div>
      </div>

      <section aria-labelledby="stock-supply-coverage" className="space-y-2.5">
        <h2
          id="stock-supply-coverage"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Cobertura da necessidade
        </h2>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-4">
            <InfoField
              label="Necessário"
              value={supply.required === null ? "Não definido" : withUnit(supply.required)}
            />
            <InfoField label="Comprado" value={withUnit(supply.purchased)} />
            <InfoField label="Recebido" value={withUnit(supply.received)} />
            <InfoField
              label="A receber"
              value={
                <span className={supply.pendingReceipt > 0 ? "text-amber-700 dark:text-amber-400" : undefined}>
                  {withUnit(supply.pendingReceipt)}
                </span>
              }
            />
            <InfoField label="Consumido" value={withUnit(supply.consumed)} />
            <InfoField label="Estoque atual" value={withUnit(supply.stock)} />
          </div>
          <div className="mt-2 border-t border-border pt-2">
            <InfoField
              label="Falta comprar"
              value={
                supply.missingToPurchase === null ? (
                  "—"
                ) : (
                  <span
                    className={
                      supply.missingToPurchase > 0
                        ? "text-base font-semibold text-destructive"
                        : "text-base font-semibold text-foreground"
                    }
                  >
                    {withUnit(supply.missingToPurchase)}
                  </span>
                )
              }
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="stock-movements" className="space-y-2.5">
        <h2
          id="stock-movements"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Movimentações
        </h2>
        {movements === undefined ? null : movements.length === 0 ? (
          <EmptyState compact icon={Boxes} title="Nenhuma movimentação registrada ainda." />
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
            {movements.map((movement) => (
              <MovementRow key={movement.id} movement={movement} unitLabel={unitLabel} />
            ))}
          </div>
        )}
      </section>

      <Button
        variant="outline"
        size="lg"
        className="w-full"
        nativeButton={false}
        render={
          <Link href={`/estoque/ajustar?projectId=${projectId}&materialId=${materialId}`}>
            Ajustar estoque
          </Link>
        }
      />
    </div>
  );
}
