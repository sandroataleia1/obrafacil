"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProject } from "@/features/projects/prototype/use-project";
import { formatMaterialUnit } from "./material-unit";
import { listActiveMaterials, getMaterial } from "./prototype/material-store";
import { listRequirementsByProject } from "./prototype/material-requirement-store";
import { createRequirement, removeRequirement, updateRequirement } from "./prototype/material-requirement";
import { useRequirement } from "./prototype/use-requirement";
import type { Material } from "./types";

export function RequirementForm({
  projectId,
  requirementId,
}: {
  projectId: string;
  requirementId?: string;
}) {
  const router = useRouter();
  const { project } = useProject(projectId);
  const { requirement: existingRequirement } = useRequirement(requirementId ?? "");
  const isEditing = Boolean(requirementId);

  const [availableMaterials, setAvailableMaterials] = useState<Material[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) return;
    const usedMaterialIds = new Set(
      listRequirementsByProject(projectId).map((requirement) => requirement.materialId)
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvailableMaterials(
      listActiveMaterials().filter((material) => !usedMaterialIds.has(material.id))
    );
  }, [projectId, isEditing]);

  useEffect(() => {
    if (!existingRequirement) return;
    // Seed the form once the existing requirement loads from localStorage.
    // Safe post-mount update (see useRequirement); only runs once the
    // record becomes available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaterialId(existingRequirement.materialId);
    setQuantityInput(String(existingRequirement.requiredQuantity).replace(".", ","));
    setNotes(existingRequirement.notes ?? "");
  }, [existingRequirement]);

  const selectedMaterial = materialId ? getMaterial(materialId) : null;

  function parseQuantity(raw: string): number | null {
    const normalized = raw.replace(/\./g, "").replace(",", ".").trim();
    if (normalized === "") return null;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  function handleSubmit() {
    const quantity = parseQuantity(quantityInput);
    if (quantity === null || quantity <= 0) {
      setError("Informe uma quantidade maior que zero.");
      return;
    }

    const result = existingRequirement
      ? updateRequirement(existingRequirement, { requiredQuantity: quantity, notes })
      : createRequirement({ projectId, materialId, requiredQuantity: quantity, notes });

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    router.push(`/obras/${projectId}/materiais`);
  }

  function handleDelete() {
    if (!existingRequirement) return;
    const confirmed = window.confirm(
      `Remover a necessidade de "${selectedMaterial?.name ?? "este material"}" nesta obra?`
    );
    if (!confirmed) return;
    removeRequirement(existingRequirement);
    router.push(`/obras/${projectId}/materiais`);
  }

  if (project === undefined) return null;
  if (isEditing && existingRequirement === undefined) return null;

  if (project === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Obra não encontrada" onBack={() => router.push("/obras")} />
      </div>
    );
  }

  if (isEditing && existingRequirement === null) {
    return (
      <div className="space-y-6">
        <BackHeader
          title="Material não encontrado"
          onBack={() => router.push(`/obras/${projectId}/materiais`)}
        />
        <p className="pl-11 text-sm text-muted-foreground">
          Ele pode ter sido removido ou o link está incorreto.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackHeader
          title={isEditing ? "Editar necessidade" : "Adicionar material"}
          onBack={() => router.push(`/obras/${projectId}/materiais`)}
        />
        <p className="pl-11 text-sm text-muted-foreground">{project.name}</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Material</span>
          {isEditing ? (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {selectedMaterial?.name ?? "—"}
            </div>
          ) : (
            <Select value={materialId} onValueChange={(value) => setMaterialId(value ?? "")}>
              <SelectTrigger className="h-12 w-full px-4 text-base">
                <SelectValue placeholder="Selecione um material">
                  {(value: string | null) =>
                    availableMaterials.find((material) => material.id === value)?.name ??
                    "Selecione um material"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableMaterials.map((material) => (
                  <SelectItem key={material.id} value={material.id}>
                    {material.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!isEditing && availableMaterials.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Todos os materiais ativos já possuem necessidade cadastrada nesta obra.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="requirement-quantity" className="text-sm font-medium text-foreground">
            Quantidade necessária
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
            <input
              id="requirement-quantity"
              type="text"
              inputMode="decimal"
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
              placeholder="0"
              className="w-full min-w-0 bg-transparent text-xl font-semibold text-foreground tabular-nums outline-none placeholder:text-muted-foreground/50"
            />
            {selectedMaterial ? (
              <span className="shrink-0 text-sm font-medium text-muted-foreground">
                {formatMaterialUnit(selectedMaterial.defaultUnit)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="requirement-notes" className="text-sm font-medium text-foreground">
            Observação <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="requirement-notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Detalhes adicionais"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <Button
        type="button"
        size="lg"
        onClick={handleSubmit}
        disabled={!isEditing && !materialId}
        className="w-full"
      >
        {isEditing ? "Salvar alterações" : "Adicionar material"}
      </Button>

      {isEditing ? (
        <Button type="button" variant="destructive" className="w-full" onClick={handleDelete}>
          Excluir
        </Button>
      ) : null}
    </div>
  );
}
