"use client";

/**
 * SUPPLY-FRONTEND-01D §20-26/§52-56. Fully API-driven — `GET
 * /stock/positions/{project}/{material}` (via `useStockPosition`) already
 * returns Project+Material+every Supply metric in one call; `GET
 * .../movements` (via `useStockMovements`) is the paginated history.
 * Zero `useProject`/`useMaterial`/`useMaterialRequirements`/Purchase
 * fan-out needed to build the main metrics — the Resource already did
 * that work server-side. A valid Project+Material pair with zero
 * physical history is a normal, successful `StockPosition` with
 * zero-valued metrics, never a 404 (§21) — `useStockPosition` already
 * encodes that: `null` means the pair itself doesn't resolve (real
 * 404), not "nothing happened yet".
 */

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { Boxes, Trash2 } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/date";
import { formatMaterialUnitCode } from "@/features/materials/material-unit";
import { deleteMaterialConsumption } from "./stock-client";
import { formatStockQuantity } from "./stock-decimal";
import { useStockPosition } from "./use-stock-position";
import { useStockMovements } from "./use-stock-movements";
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

/**
 * SUPPLY-FRONTEND-01D §24: `source_id` for a GOODS_RECEIPT movement is a
 * GoodsReceipt id, and there is no standalone GET Receipt endpoint — a
 * link here would either invent a URL the API can't resolve, or require
 * fetching the whole PurchaseOrder just to build one label. Preference
 * per spec: label without a link.
 */
function movementOrigin(movement: StockMovement): ReactNode {
  return STOCK_MOVEMENT_SOURCE_LABEL[movement.source_type];
}

function MovementRow({
  movement,
  unitLabel,
  onDelete,
  deleting,
}: {
  movement: StockMovement;
  unitLabel: string;
  onDelete: (movement: StockMovement) => void;
  deleting: boolean;
}) {
  const isEntry = movement.type === "IN" || movement.type === "ADJUSTMENT_IN";
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-foreground">{formatDate(movement.occurred_at)}</p>
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
          {isEntry ? "+" : "−"} {formatStockQuantity(movement.quantity)} {unitLabel}
        </span>
        {movement.source_type === "CONSUMPTION" ? (
          <button
            type="button"
            aria-label="Excluir consumo"
            disabled={deleting}
            onClick={() => onDelete(movement)}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

const MOVEMENTS_PER_PAGE = 30;

export function StockDetail({ projectId, materialId }: { projectId: string; materialId: string }) {
  const { position, error, reload } = useStockPosition(projectId, materialId);
  const [movementsPage, setMovementsPage] = useState(1);
  const {
    response: movementsResponse,
    error: movementsError,
    reload: reloadMovements,
  } = useStockMovements(projectId, materialId, { page: movementsPage, perPage: MOVEMENTS_PER_PAGE });
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (error) {
    return (
      <div className="space-y-6">
        <BackLink icon={Boxes} title="Estoque" href="/estoque" />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar o estoque agora.
          </p>
          <Button type="button" onClick={reload}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (position === undefined) return null;

  if (position === null) {
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

  const unitLabel = formatMaterialUnitCode(position.material.unit_code, position.material.unit_custom_label);
  const withUnit = (value: string) => `${formatStockQuantity(value)} ${unitLabel}`;

  async function handleDeleteConsumption(movement: StockMovement) {
    const confirmed = window.confirm("Excluir este registro de consumo? Esta ação não pode ser desfeita.");
    if (!confirmed) return;
    setDeleteError(null);
    setDeletingId(movement.id);
    const requestProjectId = projectId;
    const requestMaterialId = materialId;
    try {
      await deleteMaterialConsumption(movement.project_id, movement.source_id);
      if (requestProjectId !== projectId || requestMaterialId !== materialId) return;
      setDeletingId(null);
      reload();
      reloadMovements();
    } catch {
      if (requestProjectId !== projectId || requestMaterialId !== materialId) return;
      setDeletingId(null);
      setDeleteError("Não foi possível excluir este consumo agora. Tente novamente.");
    }
  }

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="space-y-1">
        <BackLink icon={Boxes} title={position.material.name} href="/estoque" />
        <p className="text-sm text-muted-foreground">{position.project.name}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <span className="mb-1 block text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Saldo atual
        </span>
        <p className="text-3xl font-semibold tabular-nums text-foreground">{withUnit(position.stock_quantity)}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <span className="mb-3 block text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Informações
        </span>
        <div className="grid grid-cols-2 gap-4">
          <InfoField label="Material" value={position.material.name} />
          <InfoField
            label="Obra"
            value={
              <Link href={`/obras/${position.project.id}`} className="text-primary hover:underline">
                {position.project.name}
              </Link>
            }
          />
          <InfoField label="Unidade" value={unitLabel} />
          <InfoField
            label="Total de entradas"
            value={<span className="tabular-nums text-primary">+{formatStockQuantity(position.total_in)}</span>}
          />
          <InfoField
            label="Total de saídas"
            value={<span className="tabular-nums text-destructive">−{formatStockQuantity(position.total_out)}</span>}
          />
        </div>
      </div>

      <section aria-labelledby="stock-supply-coverage" className="space-y-2.5">
        <h2 id="stock-supply-coverage" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Cobertura da necessidade
        </h2>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-4">
            <InfoField
              label="Necessário"
              value={position.required_quantity === null ? "Não definido" : withUnit(position.required_quantity)}
            />
            <InfoField label="Comprado" value={withUnit(position.purchased_quantity)} />
            <InfoField label="Recebido" value={withUnit(position.received_quantity)} />
            <InfoField
              label="A receber"
              value={
                <span className={Number(position.pending_receipt_quantity) > 0 ? "text-amber-700 dark:text-amber-400" : undefined}>
                  {withUnit(position.pending_receipt_quantity)}
                </span>
              }
            />
            <InfoField label="Consumido" value={withUnit(position.consumed_quantity)} />
            <InfoField label="Estoque atual" value={withUnit(position.stock_quantity)} />
          </div>
          <div className="mt-2 border-t border-border pt-2">
            <InfoField
              label="Falta comprar"
              value={
                position.missing_to_purchase_quantity === null ? (
                  "—"
                ) : (
                  <span
                    className={
                      Number(position.missing_to_purchase_quantity) > 0
                        ? "text-base font-semibold text-destructive"
                        : "text-base font-semibold text-foreground"
                    }
                  >
                    {withUnit(position.missing_to_purchase_quantity)}
                  </span>
                )
              }
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="stock-movements" className="space-y-2.5">
        <h2 id="stock-movements" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Movimentações
        </h2>
        {deleteError ? (
          <p role="alert" className="text-sm text-destructive">
            {deleteError}
          </p>
        ) : null}
        {movementsError ? (
          <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
            <p role="alert" className="text-sm text-muted-foreground">
              Não foi possível carregar as movimentações agora.
            </p>
            <Button type="button" onClick={reloadMovements}>
              Tentar novamente
            </Button>
          </div>
        ) : movementsResponse === undefined ? null : movementsResponse.data.length === 0 ? (
          <EmptyState compact icon={Boxes} title="Nenhuma movimentação registrada ainda." />
        ) : (
          <>
            <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
              {movementsResponse.data.map((movement) => (
                <MovementRow
                  key={movement.id}
                  movement={movement}
                  unitLabel={unitLabel}
                  onDelete={handleDeleteConsumption}
                  deleting={deletingId === movement.id}
                />
              ))}
            </div>
            {movementsResponse.meta.last_page > 1 ? (
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMovementsPage((current) => current - 1)}
                  disabled={movementsPage <= 1}
                >
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  Página {movementsResponse.meta.current_page} de {movementsResponse.meta.last_page}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMovementsPage((current) => current + 1)}
                  disabled={movementsPage >= movementsResponse.meta.last_page}
                >
                  Próxima
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <Button
        variant="outline"
        size="lg"
        className="w-full"
        nativeButton={false}
        render={<Link href={`/estoque/ajustar?projectId=${projectId}&materialId=${materialId}`}>Ajustar estoque</Link>}
      />
    </div>
  );
}
