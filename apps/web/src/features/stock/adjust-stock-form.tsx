"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
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
 * "Ajustar estoque" — dedicated page (Pilot-Ready "Ajustar Estoque —
 * Página Dedicada"), replacing `AdjustStockDialog` (removed — this is
 * its only surface now). Same domain path as before: always writes
 * through `createStockAdjustment`, the same guarded function used
 * everywhere else — no logic duplicated, only the chrome changed from
 * Dialog/Sheet to a normal routed page.
 *
 * Context arrives via query params, exactly like `ReceivableForm`'s
 * `?projectId=` convention (`receivable-form.tsx`):
 * - `projectId` + `materialId` both present (opened from the detail
 *   page of a specific Obra+Material) → both fixed/contextualized, not
 *   editable — mirrors the Dialog's old `projectId`/`materialId` fixed
 *   props exactly.
 * - only `projectId` present (opened from the listing while a specific
 *   Obra filter was active) → Obra pre-selected but still editable,
 *   Material starts unselected — mirrors the Dialog's old
 *   `initialProjectId` prefill.
 * - neither present (listing with "Todas as obras") → both start
 *   unselected. Never silently defaults to the first Obra/Material in
 *   the list — an arbitrary guess here would risk an adjustment
 *   registered against the wrong Obra.
 * An invalid id in the URL (a stale link, a typo) is treated exactly
 * like "not provided" — `getProject`/`getMaterial` returning `null`
 * falls through to the normal unselected-field state instead of
 * crashing the page.
 */
export function AdjustStockForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawProjectId = searchParams.get("projectId");
  const rawMaterialId = searchParams.get("materialId");
  // An invalid/stale id in the URL is treated exactly like "not
  // provided" — falls through to the normal unselected-field state.
  const validProjectId = rawProjectId && getProject(rawProjectId) ? rawProjectId : null;
  const fixedMaterialId =
    validProjectId && rawMaterialId && getMaterial(rawMaterialId) ? rawMaterialId : null;
  // Only a full projectId+materialId pair (opened from a specific
  // detail page) locks the Obra field too — a lone projectId (opened
  // from the listing with an Obra filter active) is a prefill only.
  const fixedProjectId = fixedMaterialId ? validProjectId : null;
  const initialProjectId = validProjectId;

  const projects = listAllProjects();
  const materials = listMaterials();

  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId ?? "");
  const [selectedMaterialId, setSelectedMaterialId] = useState(fixedMaterialId ?? "");
  const [type, setType] = useState<StockAdjustmentType>("ADJUSTMENT_IN");
  const [quantityInput, setQuantityInput] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Query params only ever change via a fresh navigation to this page
  // (never edited in place), so re-seeding on mount is sufficient —
  // no dependency-driven reset effect needed like the Dialog had for
  // repeated open/close cycles.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedProjectId(initialProjectId ?? "");
    setSelectedMaterialId(fixedMaterialId ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveProjectId = fixedProjectId ?? selectedProjectId;
  const effectiveMaterialId = fixedMaterialId ?? selectedMaterialId;
  const project = effectiveProjectId ? getProject(effectiveProjectId) : null;
  const material = effectiveMaterialId ? getMaterial(effectiveMaterialId) : null;
  const unitLabel = material ? formatMaterialUnit(material.defaultUnit) : null;
  const currentBalance =
    project && material ? getStockBalance(effectiveProjectId, effectiveMaterialId) : null;

  function destination(): string {
    // Came from a specific detail page -> return to that same detail.
    // Otherwise (from the listing, with or without an Obra filter) ->
    // back to the listing. Matches how the Dialog used to close back
    // into whichever screen opened it.
    if (fixedProjectId && fixedMaterialId) {
      return `/estoque/${fixedProjectId}/${fixedMaterialId}`;
    }
    return "/estoque";
  }

  function handleCancel() {
    router.push(destination());
  }

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
    router.push(destination());
  }

  return (
    <div className="w-full max-w-3xl space-y-6 pb-6">
      <BackLink
        title="Ajustar estoque"
        description="Registre uma correção de entrada ou saída do estoque."
        href={destination()}
      />

      <div className="space-y-4">
        {fixedProjectId ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Obra</span>
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {project?.name ?? "—"}
            </div>
          </div>
        ) : (
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

        {fixedMaterialId ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Material</span>
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {material?.name ?? "—"}
            </div>
          </div>
        ) : (
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
          <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">Saldo atual</p>
            <p className="text-base font-semibold tabular-nums text-foreground">
              {formatQuantity(currentBalance)} {unitLabel}
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

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={handleCancel}>
          Cancelar
        </Button>
        <Button type="button" onClick={handleConfirm}>
          Confirmar
        </Button>
      </div>
    </div>
  );
}
