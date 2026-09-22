"use client";

/**
 * SUPPLY-FRONTEND-01D §27-31/§51. Real API POST — `getStockPosition`
 * (via `useStockPosition`) is the sole context source: it already
 * embeds Project name, Material name/unit/active, and the current
 * `stock_quantity`, so this form needs zero `useProject`/`useMaterial`/
 * Purchase fan-out. The POST goes straight to the backend, which is the
 * sole authority for chronology/balance validation (§27/§30) — this
 * form never re-implements a ledger locally. Material inactive stays
 * consumable (backend allows it — §28).
 *
 * Outer-wrapper + keyed-Inner tenant-ownership pattern
 * (`${companyId}:${projectId}:${materialId}`) — a POST that resolves
 * after a Company/Project/Material switch produces zero navigation/
 * error/success (§51).
 */

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Package } from "lucide-react";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { todayIso } from "@/lib/date";
import { useAuth } from "@/features/auth/auth-provider";
import { formatMaterialUnitCode } from "./material-unit";
import { createMaterialConsumption } from "@/features/stock/stock-client";
import { formatStockQuantity, stockQuantityInputToApi } from "@/features/stock/stock-decimal";
import { useStockPosition } from "@/features/stock/use-stock-position";

function ConsumptionFormInner({
  projectId,
  materialId,
  activeCompanyIdRef,
  projectIdRef,
  materialIdRef,
}: {
  projectId: string;
  materialId: string;
  activeCompanyIdRef: React.RefObject<string | undefined>;
  projectIdRef: React.RefObject<string>;
  materialIdRef: React.RefObject<string>;
}) {
  const router = useRouter();
  const { position, error, reload } = useStockPosition(projectId, materialId);

  const [quantityInput, setQuantityInput] = useState("");
  const [consumedAt, setConsumedAt] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (error) {
    return (
      <div className="space-y-6">
        <BackHeader title="Obra" onBack={() => router.push(`/obras/${projectId}/materiais`)} />
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
        <BackHeader title="Não encontrado" onBack={() => router.push(`/obras/${projectId}/materiais`)} />
        <EmptyState
          icon={Package}
          title="Obra ou material não encontrado"
          description="Podem ter sido removidos ou o link está incorreto."
        />
      </div>
    );
  }

  const unitLabel = formatMaterialUnitCode(position.material.unit_code, position.material.unit_custom_label);

  const submitCompanyId = activeCompanyIdRef.current;
  const submitProjectId = projectIdRef.current;
  const submitMaterialId = materialIdRef.current;
  function isStale(): boolean {
    return (
      activeCompanyIdRef.current !== submitCompanyId ||
      projectIdRef.current !== submitProjectId ||
      materialIdRef.current !== submitMaterialId
    );
  }

  async function handleSubmit() {
    const quantity = stockQuantityInputToApi(quantityInput);
    if (quantity === null) {
      setFormError("Informe uma quantidade válida, maior que zero e com até 3 casas decimais.");
      return;
    }
    if (consumedAt.trim() === "") {
      setFormError("Informe a data de uso.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await createMaterialConsumption(projectId, {
        material_id: materialId,
        quantity,
        consumed_at: consumedAt,
        notes: notes.trim() || null,
      });
      if (isStale()) return;
      setSubmitting(false);
      router.push(`/obras/${projectId}/materiais`);
    } catch (submitError) {
      if (isStale()) return;
      setSubmitting(false);
      if (submitError instanceof ApiValidationError) {
        const firstMessage =
          submitError.errors.material_id?.[0] ??
          submitError.errors.quantity?.[0] ??
          submitError.errors.consumed_at?.[0] ??
          Object.values(submitError.errors)[0]?.[0];
        setFormError(firstMessage ?? submitError.serverMessage ?? "Não foi possível registrar. Verifique os campos.");
        return;
      }
      if (submitError instanceof ApiError) {
        setFormError(submitError.message || "Não foi possível registrar agora. Tente novamente.");
        return;
      }
      setFormError("Não foi possível registrar agora. Tente novamente.");
    }
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackHeader title="Registrar uso" onBack={() => router.push(`/obras/${projectId}/materiais`)} />
        <p className="pl-11 text-sm text-muted-foreground">
          {position.material.name}
          {!position.material.active ? " (inativo)" : ""} · {position.project.name}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="consumption-quantity" className="text-sm font-medium text-foreground">
              Quantidade utilizada
            </label>
            <span className="text-xs text-muted-foreground">
              Disponível: {formatStockQuantity(position.stock_quantity)} {unitLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
            <input
              id="consumption-quantity"
              type="text"
              inputMode="decimal"
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
              placeholder="0"
              className="w-full min-w-0 bg-transparent text-xl font-semibold text-foreground tabular-nums outline-none placeholder:text-muted-foreground/50"
            />
            <span className="shrink-0 text-sm font-medium text-muted-foreground">{unitLabel}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="consumption-date" className="text-sm font-medium text-foreground">
            Data de uso
          </label>
          <input
            id="consumption-date"
            type="date"
            value={consumedAt}
            max={todayIso()}
            onChange={(event) => setConsumedAt(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="consumption-notes" className="text-sm font-medium text-foreground">
            Observação <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="consumption-notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Ex: Alvenaria lateral"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}
      </div>

      <Button type="button" size="lg" onClick={() => void handleSubmit()} disabled={submitting} className="w-full">
        Registrar uso
      </Button>
    </div>
  );
}

export function ConsumptionForm({ projectId, materialId }: { projectId: string; materialId: string }) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  const projectIdRef = useRef(projectId);
  const materialIdRef = useRef(materialId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    projectIdRef.current = projectId;
    materialIdRef.current = materialId;
  }, [activeCompanyId, projectId, materialId]);

  return (
    <ConsumptionFormInner
      key={`${activeCompanyId}:${projectId}:${materialId}`}
      projectId={projectId}
      materialId={materialId}
      activeCompanyIdRef={activeCompanyIdRef}
      projectIdRef={projectIdRef}
      materialIdRef={materialIdRef}
    />
  );
}
