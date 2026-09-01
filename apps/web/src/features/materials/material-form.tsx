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
import { todayIso } from "@/lib/date";
import { materialHasRequirements, updateMaterial } from "./prototype/material";
import { createMaterialId, saveMaterial } from "./prototype/material-store";
import { useMaterial } from "./prototype/use-material";
import { MATERIAL_UNIT_CODE_LABEL, MATERIAL_UNIT_CODES, type MaterialUnitCode } from "./types";

const UNIT_OPTION_LABEL: Record<MaterialUnitCode, string> = {
  ...MATERIAL_UNIT_CODE_LABEL,
  other: "Outro",
};

export function MaterialForm({ materialId }: { materialId?: string }) {
  const router = useRouter();
  const { material: existingMaterial } = useMaterial(materialId ?? "");
  const isEditing = Boolean(materialId);

  const [name, setName] = useState("");
  const [unitCode, setUnitCode] = useState<MaterialUnitCode>("un");
  const [customUnitLabel, setCustomUnitLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [unitLocked, setUnitLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existingMaterial) return;
    // Seed the form once the existing material loads from localStorage.
    // Safe post-mount update (see useMaterial); only runs once the
    // record becomes available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(existingMaterial.name);
    setUnitCode(existingMaterial.defaultUnit.code);
    setCustomUnitLabel(existingMaterial.defaultUnit.customLabel ?? "");
    setNotes(existingMaterial.notes ?? "");
    setUnitLocked(materialHasRequirements(existingMaterial.id));
  }, [existingMaterial]);

  function handleSubmit() {
    if (name.trim() === "") {
      setError("Informe o nome do material.");
      return;
    }
    if (unitCode === "other" && customUnitLabel.trim() === "") {
      setError("Informe o nome da unidade.");
      return;
    }

    const defaultUnit =
      unitCode === "other"
        ? { code: unitCode, customLabel: customUnitLabel.trim() }
        : { code: unitCode };

    if (existingMaterial) {
      const result = updateMaterial(existingMaterial, {
        name,
        defaultUnit,
        notes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.push(`/materiais/${result.material.id}`);
      return;
    }

    setError(null);
    const now = todayIso();
    const material = {
      id: createMaterialId(),
      name: name.trim(),
      defaultUnit,
      notes: notes.trim() || undefined,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    };
    saveMaterial(material);
    router.push(`/materiais/${material.id}`);
  }

  if (isEditing && existingMaterial === undefined) return null;

  if (isEditing && existingMaterial === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Material não encontrado" onBack={() => router.push("/materiais")} />
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
          title={isEditing ? "Editar material" : "Novo material"}
          onBack={() =>
            router.push(existingMaterial ? `/materiais/${existingMaterial.id}` : "/materiais")
          }
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="material-name" className="text-sm font-medium text-foreground">
            Nome
          </label>
          <input
            id="material-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Cimento CP-II"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Unidade padrão</span>
          {unitLocked ? (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {UNIT_OPTION_LABEL[unitCode]}
              {unitCode === "other" && customUnitLabel ? ` (${customUnitLabel})` : ""}
            </div>
          ) : (
            <Select
              value={unitCode}
              onValueChange={(value) => setUnitCode((value as MaterialUnitCode) ?? "un")}
            >
              <SelectTrigger className="h-12 w-full px-4 text-base">
                <SelectValue placeholder="Selecione uma unidade">
                  {(value: string | null) => UNIT_OPTION_LABEL[(value as MaterialUnitCode) ?? "un"]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MATERIAL_UNIT_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {UNIT_OPTION_LABEL[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {unitLocked ? (
            <p className="text-xs text-muted-foreground">
              A unidade não pode ser alterada porque este material já está em uso em obras.
            </p>
          ) : null}
        </div>

        {!unitLocked && unitCode === "other" ? (
          <div className="space-y-1.5">
            <label htmlFor="material-custom-unit" className="text-sm font-medium text-foreground">
              Nome da unidade
            </label>
            <input
              id="material-custom-unit"
              type="text"
              value={customUnitLabel}
              onChange={(event) => setCustomUnitLabel(event.target.value)}
              placeholder="barra, rolo, milheiro..."
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="material-notes" className="text-sm font-medium text-foreground">
            Observação <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="material-notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Detalhes adicionais"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <Button type="button" size="lg" onClick={handleSubmit} className="w-full">
        {isEditing ? "Salvar alterações" : "Cadastrar material"}
      </Button>
    </div>
  );
}
