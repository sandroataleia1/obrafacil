"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Package } from "lucide-react";
import { todayIso } from "@/lib/date";
import { formatQuantity } from "@/lib/quantity";
import { useProject } from "@/features/projects/prototype/use-project";
import { formatMaterialUnit } from "./material-unit";
import { getMaterial } from "./prototype/material-store";
import { calculateAvailableQuantity, registerMaterialConsumption } from "./prototype/material-consumption";

function parseQuantity(raw: string): number | null {
  const normalized = raw.replace(/\./g, "").replace(",", ".").trim();
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function ConsumptionForm({ projectId, materialId }: { projectId: string; materialId: string }) {
  const router = useRouter();
  const { project } = useProject(projectId);
  const material = getMaterial(materialId);

  const [quantityInput, setQuantityInput] = useState("");
  const [consumedAt, setConsumedAt] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (project === undefined) return null;

  if (project === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Obra não encontrada" onBack={() => router.push("/obras")} />
      </div>
    );
  }

  if (!material) {
    return (
      <div className="space-y-6">
        <BackHeader
          title="Material não encontrado"
          onBack={() => router.push(`/obras/${projectId}/materiais`)}
        />
        <EmptyState
          icon={Package}
          title="Material não encontrado"
          description="Ele pode ter sido removido ou o link está incorreto."
        />
      </div>
    );
  }

  const unitLabel = formatMaterialUnit(material.defaultUnit);
  const available = calculateAvailableQuantity(projectId, materialId);

  function handleSubmit() {
    const quantity = parseQuantity(quantityInput);
    if (quantity === null || quantity <= 0) {
      setError("Informe uma quantidade maior que zero.");
      return;
    }
    if (consumedAt.trim() === "") {
      setError("Informe a data de uso.");
      return;
    }

    const result = registerMaterialConsumption({
      projectId,
      materialId,
      quantity,
      consumedAt,
      notes,
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    router.push(`/obras/${projectId}/materiais`);
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackHeader
          title="Registrar uso"
          onBack={() => router.push(`/obras/${projectId}/materiais`)}
        />
        <p className="pl-11 text-sm text-muted-foreground">
          {material.name}
          {material.status === "inactive" ? " (inativo)" : ""} · {project.name}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="consumption-quantity" className="text-sm font-medium text-foreground">
              Quantidade utilizada
            </label>
            <span className="text-xs text-muted-foreground">
              Disponível: {formatQuantity(available)} {unitLabel}
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

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <Button type="button" size="lg" onClick={handleSubmit} className="w-full">
        Registrar uso
      </Button>
    </div>
  );
}
