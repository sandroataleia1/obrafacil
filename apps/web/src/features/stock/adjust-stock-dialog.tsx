"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { todayIso } from "@/lib/date";
import { formatQuantity } from "@/lib/quantity";
import { formatMaterialUnit } from "@/features/materials/material-unit";
import { getMaterial, listMaterials } from "@/features/materials/prototype/material-store";
import { getProject, listAllProjects } from "@/features/projects/prototype/project-store";
import { createStockAdjustment, getStockBalance } from "./prototype/stock";
import type { StockAdjustmentType } from "./types";

function parseQuantity(raw: string): number | null {
  const normalized = raw.replace(/\./g, "").replace(",", ".").trim();
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const TYPE_OPTIONS: { value: StockAdjustmentType; label: string }[] = [
  { value: "ADJUSTMENT_IN", label: "Entrada" },
  { value: "ADJUSTMENT_OUT", label: "Saída" },
];

/**
 * "Ajustar estoque" — a small contextual Dialog (Pilot-Ready "Estoque
 * Básico por Obra" §18), not a second "dar baixa" flow: this only
 * covers the one genuinely new case (correction/initial count/quebra)
 * that no existing entity already represents. Always writes through
 * `createStockAdjustment`, the same guarded path used everywhere else.
 *
 * Reused from two contexts (Estoque 1A §11), never duplicated into two
 * forms: called from the detail page with `projectId`/`materialId`
 * fixed (both fields hidden — the context is already unambiguous),
 * and from the listing page with neither prop (Obra + Material selects
 * appear, letting a user register an opening balance for a pair that
 * has no GoodsReceipt/Consumption/StockAdjustment yet).
 */
export function AdjustStockDialog({
  projectId: fixedProjectId,
  materialId: fixedMaterialId,
  open,
  onOpenChange,
  onAdjusted,
}: {
  projectId?: string;
  materialId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdjusted: () => void;
}) {
  const projects = listAllProjects();
  const materials = listMaterials();

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [type, setType] = useState<StockAdjustmentType>("ADJUSTMENT_IN");
  const [quantityInput, setQuantityInput] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedProjectId("");
    setSelectedMaterialId("");
    setType("ADJUSTMENT_IN");
    setQuantityInput("");
    setOccurredAt(todayIso());
    setReason("");
    setError(null);
  }, [open]);

  const effectiveProjectId = fixedProjectId ?? selectedProjectId;
  const effectiveMaterialId = fixedMaterialId ?? selectedMaterialId;
  const project = effectiveProjectId ? getProject(effectiveProjectId) : null;
  const material = effectiveMaterialId ? getMaterial(effectiveMaterialId) : null;
  const unitLabel = material ? formatMaterialUnit(material.defaultUnit) : null;
  const currentBalance =
    project && material ? getStockBalance(effectiveProjectId, effectiveMaterialId) : null;

  function handleConfirm() {
    if (!effectiveProjectId || !effectiveMaterialId) {
      setError("Selecione a obra e o material.");
      return;
    }
    const quantity = parseQuantity(quantityInput);
    if (quantity === null || quantity <= 0) {
      setError("Informe uma quantidade maior que zero.");
      return;
    }

    const result = createStockAdjustment({
      projectId: effectiveProjectId,
      materialId: effectiveMaterialId,
      type,
      quantity,
      occurredAt,
      reason,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    onAdjusted();
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ajustar estoque"
      description={material?.name}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm}>
            Confirmar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {fixedProjectId ? null : (
          <div className="space-y-1.5">
            <label htmlFor="stock-adjustment-project" className="text-sm font-medium text-foreground">
              Obra
            </label>
            <select
              id="stock-adjustment-project"
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione a obra</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {fixedMaterialId ? null : (
          <div className="space-y-1.5">
            <label htmlFor="stock-adjustment-material" className="text-sm font-medium text-foreground">
              Material
            </label>
            <select
              id="stock-adjustment-material"
              value={selectedMaterialId}
              onChange={(event) => setSelectedMaterialId(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione o material</option>
              {materials.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {material && currentBalance !== null ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">
              Saldo atual: {formatQuantity(currentBalance)} {unitLabel}
            </p>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Tipo de ajuste</span>
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={type === option.value}
                onClick={() => setType(option.value)}
                className={
                  type === option.value
                    ? "rounded-xl border border-primary bg-primary/5 py-2.5 text-sm font-semibold text-primary"
                    : "rounded-xl border border-border bg-card py-2.5 text-sm font-semibold text-foreground hover:border-primary/30"
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="stock-adjustment-quantity" className="text-sm font-medium text-foreground">
            Quantidade
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
            <input
              id="stock-adjustment-quantity"
              type="text"
              inputMode="decimal"
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
              placeholder="0"
              className="w-full min-w-0 bg-transparent text-xl font-semibold text-foreground tabular-nums outline-none placeholder:text-muted-foreground/50"
            />
            {unitLabel ? (
              <span className="shrink-0 text-sm font-medium text-muted-foreground">{unitLabel}</span>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="stock-adjustment-date" className="text-sm font-medium text-foreground">
            Data
          </label>
          <input
            id="stock-adjustment-date"
            type="date"
            value={occurredAt}
            max={todayIso()}
            onChange={(event) => setOccurredAt(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="stock-adjustment-reason" className="text-sm font-medium text-foreground">
            Motivo/observação <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="stock-adjustment-reason"
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex: Contagem física, quebra no transporte"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </ResponsiveDialog>
  );
}
