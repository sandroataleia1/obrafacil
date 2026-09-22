"use client";

/**
 * SUPPLY-FRONTEND-01D §32-34/§51. Real API POST — no PurchaseOrder
 * fan-out, no local `getStockBalance`/`createStockAdjustment`.
 * `useStockPosition` may be used to display the current
 * `stock_quantity` as context, but it is NEVER a submit-blocking
 * authority: the backend's chronology validation is the sole authority
 * (a visually "valid" OUT can still 422 if the date is retroactive to a
 * later fact). Material inactive is still adjustable.
 *
 * Outer-wrapper + keyed-Inner tenant-ownership pattern, coherent with
 * this form's query-param context: `${companyId}:${rawProjectId}:
 * ${rawMaterialId}` (query params only ever change via a fresh
 * navigation to this page — never edited in place — so remounting on
 * them is safe and matches `ConsumptionForm`'s convention).
 */

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Boxes } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { todayIso } from "@/lib/date";
import { formatMaterialUnitCode } from "@/features/materials/material-unit";
import { useAllMaterials } from "@/features/materials/use-all-materials";
import { useAllProjects } from "@/features/projects/use-all-projects";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { createStockAdjustment } from "./stock-client";
import { formatStockQuantity, stockQuantityInputToApi } from "./stock-decimal";
import { useStockPosition } from "./use-stock-position";
import type { StockAdjustmentType } from "./types";

const TYPE_OPTIONS: { value: StockAdjustmentType; label: string }[] = [
  { value: "ADJUSTMENT_IN", label: "Entrada" },
  { value: "ADJUSTMENT_OUT", label: "Saída" },
];

/**
 * "Ajustar estoque" — dedicated page. Context arrives via query params,
 * exactly like `ReceivableForm`'s `?projectId=` convention:
 * - `projectId` + `materialId` both present → both fixed, not editable.
 * - only `projectId` present → Obra pre-selected but still editable.
 * - neither present → both start unselected. Never silently defaults
 *   to the first Obra/Material in the list.
 * An invalid id in the URL is treated exactly like "not provided".
 */
function AdjustStockFormInner({
  rawProjectId,
  rawMaterialId,
  activeCompanyIdRef,
  rawProjectIdRef,
  rawMaterialIdRef,
}: {
  rawProjectId: string | null;
  rawMaterialId: string | null;
  activeCompanyIdRef: React.RefObject<string | undefined>;
  rawProjectIdRef: React.RefObject<string | null>;
  rawMaterialIdRef: React.RefObject<string | null>;
}) {
  const router = useRouter();

  const { projects: allProjects, error: projectsError } = useAllProjects();
  const projects = allProjects ?? [];
  const validProjectId =
    rawProjectId && !projectsError && (allProjects === undefined || projects.some((project) => project.id === rawProjectId))
      ? rawProjectId
      : null;

  const { materials: allMaterials, error: materialsError } = useAllMaterials();
  const materials = allMaterials ?? [];
  const fixedMaterialId =
    validProjectId && rawMaterialId && !materialsError && (allMaterials === undefined || materials.some((material) => material.id === rawMaterialId))
      ? rawMaterialId
      : null;
  const fixedProjectId = fixedMaterialId ? validProjectId : null;
  const initialProjectId = validProjectId;

  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId ?? "");
  const [selectedMaterialId, setSelectedMaterialId] = useState(fixedMaterialId ?? "");
  const [type, setType] = useState<StockAdjustmentType>("ADJUSTMENT_IN");
  const [quantityInput, setQuantityInput] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const effectiveProjectId = fixedProjectId ?? selectedProjectId;
  const effectiveMaterialId = fixedMaterialId ?? selectedMaterialId;
  const project = effectiveProjectId ? (projects.find((item) => item.id === effectiveProjectId) ?? null) : null;
  const material = effectiveMaterialId ? (materials.find((item) => item.id === effectiveMaterialId) ?? null) : null;
  const unitLabel = material ? formatMaterialUnitCode(material.unit_code, material.unit_custom_label) : null;

  // Context only — never a submit-blocking authority (§34).
  const { position, error: positionError } = useStockPosition(effectiveProjectId, effectiveMaterialId);

  function destination(): string {
    if (fixedProjectId && fixedMaterialId) {
      return `/estoque/${fixedProjectId}/${fixedMaterialId}`;
    }
    return "/estoque";
  }

  function handleCancel() {
    router.push(destination());
  }

  const submitCompanyId = activeCompanyIdRef.current;
  const submitRawProjectId = rawProjectIdRef.current;
  const submitRawMaterialId = rawMaterialIdRef.current;
  function isStale(): boolean {
    return (
      activeCompanyIdRef.current !== submitCompanyId ||
      rawProjectIdRef.current !== submitRawProjectId ||
      rawMaterialIdRef.current !== submitRawMaterialId
    );
  }

  async function handleConfirm() {
    if (!effectiveProjectId || !effectiveMaterialId || !project) {
      setError("Selecione a obra e o material.");
      return;
    }
    const quantity = stockQuantityInputToApi(quantityInput);
    if (quantity === null) {
      setError("Informe uma quantidade válida, maior que zero e com até 3 casas decimais.");
      return;
    }
    if (occurredAt.trim() === "") {
      setError("Informe a data.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createStockAdjustment(effectiveProjectId, {
        material_id: effectiveMaterialId,
        type,
        quantity,
        occurred_at: occurredAt,
        reason: reason.trim() || null,
      });
      if (isStale()) return;
      setSubmitting(false);
      router.push(destination());
    } catch (submitError) {
      if (isStale()) return;
      setSubmitting(false);
      if (submitError instanceof ApiValidationError) {
        const firstMessage =
          submitError.errors.material_id?.[0] ??
          submitError.errors.quantity?.[0] ??
          submitError.errors.occurred_at?.[0] ??
          submitError.errors.type?.[0] ??
          Object.values(submitError.errors)[0]?.[0];
        setError(firstMessage ?? submitError.serverMessage ?? "Não foi possível registrar. Verifique os campos.");
        return;
      }
      if (submitError instanceof ApiError) {
        setError(submitError.message || "Não foi possível registrar agora. Tente novamente.");
        return;
      }
      setError("Não foi possível registrar agora. Tente novamente.");
    }
  }

  return (
    <div className="w-full max-w-3xl space-y-6 pb-6">
      <BackLink
        icon={Boxes}
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
            {projectsError ? (
              <p className="text-xs text-destructive">Não foi possível carregar as obras agora.</p>
            ) : allProjects === undefined ? (
              <p className="text-xs text-muted-foreground">Carregando obras...</p>
            ) : null}
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
            {materialsError ? (
              <p className="text-xs text-destructive">Não foi possível carregar os materiais agora.</p>
            ) : allMaterials === undefined ? (
              <p className="text-xs text-muted-foreground">Carregando materiais...</p>
            ) : null}
          </div>
        )}

        {material && positionError ? (
          <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-2.5">
            <p role="alert" className="text-xs text-muted-foreground">
              Não foi possível carregar o saldo atual agora.
            </p>
          </div>
        ) : material && position ? (
          <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">Saldo atual</p>
            <p className="text-base font-semibold tabular-nums text-foreground">
              {formatStockQuantity(position.stock_quantity)} {unitLabel}
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

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={handleCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void handleConfirm()} disabled={submitting}>
          Confirmar
        </Button>
      </div>
    </div>
  );
}

export function AdjustStockForm() {
  const searchParams = useSearchParams();
  const rawProjectId = searchParams.get("projectId");
  const rawMaterialId = searchParams.get("materialId");

  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  const rawProjectIdRef = useRef(rawProjectId);
  const rawMaterialIdRef = useRef(rawMaterialId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    rawProjectIdRef.current = rawProjectId;
    rawMaterialIdRef.current = rawMaterialId;
  }, [activeCompanyId, rawProjectId, rawMaterialId]);

  return (
    <AdjustStockFormInner
      key={`${activeCompanyId}:${rawProjectId ?? ""}:${rawMaterialId ?? ""}`}
      rawProjectId={rawProjectId}
      rawMaterialId={rawMaterialId}
      activeCompanyIdRef={activeCompanyIdRef}
      rawProjectIdRef={rawProjectIdRef}
      rawMaterialIdRef={rawMaterialIdRef}
    />
  );
}
