"use client";

/**
 * SUPPLY-FRONTEND-01B §15-24. Real API create/edit/delete — no browser
 * UUID, no `todayIso()` for timestamps, server is authority.
 * `required_quantity` is a decimal STRING at scale 3 end-to-end; see
 * `requirement-quantity.ts`. Outer-wrapper + keyed-Inner tenant-ownership
 * pattern mirrors `MaterialForm`/`SupplierForm`/`MaterialDetail`: the
 * outer owns `activeCompanyIdRef`/`projectIdRef`/`requirementIdRef`
 * (written together via `useLayoutEffect`) and force-remounts the Inner
 * via `key={`${activeCompanyId}:${projectId}:${requirementId ?? "new"}`}`
 * on any Company/Project/id switch.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiValidationError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { useProject } from "@/features/projects/use-project";
import { formatMaterialUnitCode } from "./material-unit";
import { useAllMaterials } from "./use-all-materials";
import { useMaterialRequirement } from "./use-material-requirement";
import { useMaterialRequirements } from "./use-material-requirements";
import {
  createMaterialRequirement,
  deleteMaterialRequirement,
  updateMaterialRequirement,
} from "./material-requirements-client";
import { requirementQuantityApiToInput, requirementQuantityInputToApi } from "./requirement-quantity";

function RequirementFormInner({
  projectId,
  requirementId,
  activeCompanyIdRef,
  projectIdRef,
  requirementIdRef,
}: {
  projectId: string;
  requirementId?: string;
  activeCompanyIdRef: React.RefObject<string | undefined>;
  projectIdRef: React.RefObject<string>;
  requirementIdRef: React.RefObject<string>;
}) {
  const router = useRouter();
  const { project, error: projectError, reload: reloadProject } = useProject(projectId);
  const {
    requirement: existingRequirement,
    error: requirementError,
    reload: reloadRequirement,
  } = useMaterialRequirement(projectId, requirementId ?? "");
  const isEditing = Boolean(requirementId);

  const [materialId, setMaterialId] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { materials: activeMaterials, error: materialsError } = useAllMaterials({ active: true });
  const { requirements: existingRequirements } = useMaterialRequirements(projectId);

  const usedMaterialIds = new Set(
    isEditing ? [] : (existingRequirements ?? []).map((requirement) => requirement.material.id)
  );
  const availableMaterials = (activeMaterials ?? []).filter((material) => !usedMaterialIds.has(material.id));

  useEffect(() => {
    if (!existingRequirement) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaterialId(existingRequirement.material.id);
    setQuantityInput(requirementQuantityApiToInput(existingRequirement.required_quantity));
    setNotes(existingRequirement.notes ?? "");
  }, [existingRequirement]);

  const submitCompanyId = activeCompanyIdRef.current;
  const submitProjectId = projectIdRef.current;
  const submitRequirementId = requirementIdRef.current;

  const isStale = useCallback(
    () =>
      activeCompanyIdRef.current !== submitCompanyId ||
      projectIdRef.current !== submitProjectId ||
      requirementIdRef.current !== submitRequirementId,
    [activeCompanyIdRef, projectIdRef, requirementIdRef, submitCompanyId, submitProjectId, submitRequirementId]
  );

  const handleSubmit = useCallback(async () => {
    if (!isEditing && !materialId) {
      setError("Selecione um material.");
      return;
    }
    const quantity = requirementQuantityInputToApi(quantityInput);
    if (quantity === null) {
      setError("Informe uma quantidade válida, maior que zero e com até 3 casas decimais.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (isEditing && existingRequirement) {
        await updateMaterialRequirement(projectId, existingRequirement.id, {
          required_quantity: quantity,
          notes: notes.trim() || null,
        });
      } else {
        await createMaterialRequirement(projectId, {
          material_id: materialId,
          required_quantity: quantity,
          notes: notes.trim() || null,
        });
      }

      if (isStale()) return;
      setSubmitting(false);
      router.push(`/obras/${projectId}/materiais`);
    } catch (submitError) {
      if (isStale()) return;
      setSubmitting(false);
      if (submitError instanceof ApiValidationError) {
        const firstMessage =
          submitError.errors.material_id?.[0] ??
          submitError.errors.required_quantity?.[0] ??
          submitError.errors.notes?.[0] ??
          Object.values(submitError.errors)[0]?.[0];
        setError(firstMessage ?? submitError.serverMessage ?? "Não foi possível salvar. Verifique os campos.");
        return;
      }
      setError("Não foi possível salvar agora. Tente novamente.");
    }
  }, [isEditing, materialId, quantityInput, notes, existingRequirement, projectId, isStale, router]);

  async function handleDelete() {
    if (!existingRequirement) return;
    const confirmed = window.confirm(
      `Remover a necessidade de "${existingRequirement.material.name}" nesta obra?`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    try {
      await deleteMaterialRequirement(projectId, existingRequirement.id);
      if (isStale()) return;
      router.push(`/obras/${projectId}/materiais`);
    } catch (deleteError) {
      if (isStale()) return;
      setDeleting(false);
      if (deleteError instanceof ApiValidationError) {
        setError(deleteError.serverMessage ?? Object.values(deleteError.errors)[0]?.[0] ?? "Não foi possível excluir agora.");
        return;
      }
      setError("Não foi possível excluir agora.");
    }
  }

  if (projectError) {
    return (
      <div className="space-y-6">
        <BackHeader title="Obra" onBack={() => router.push("/obras")} />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar esta obra agora.
          </p>
          <Button type="button" onClick={reloadProject}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (project === undefined) return null;

  if (project === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Obra não encontrada" onBack={() => router.push("/obras")} />
      </div>
    );
  }

  if (isEditing && requirementError) {
    return (
      <div className="space-y-6">
        <BackHeader title="Material" onBack={() => router.push(`/obras/${projectId}/materiais`)} />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar esta necessidade agora.
          </p>
          <Button type="button" onClick={reloadRequirement}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (isEditing && existingRequirement === undefined) return null;

  if (isEditing && existingRequirement === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Material não encontrado" onBack={() => router.push(`/obras/${projectId}/materiais`)} />
        <p className="pl-11 text-sm text-muted-foreground">Ele pode ter sido removido ou o link está incorreto.</p>
      </div>
    );
  }

  const selectedNewMaterial = (activeMaterials ?? []).find((material) => material.id === materialId) ?? null;
  const selectedMaterialLabel =
    isEditing && existingRequirement
      ? `${existingRequirement.material.name}${existingRequirement.material.active ? "" : " (inativo)"}`
      : "—";
  const selectedMaterialUnit =
    isEditing && existingRequirement
      ? formatMaterialUnitCode(existingRequirement.material.unit_code, existingRequirement.material.unit_custom_label)
      : selectedNewMaterial
        ? formatMaterialUnitCode(selectedNewMaterial.unit_code, selectedNewMaterial.unit_custom_label)
        : "";

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
              {selectedMaterialLabel}
            </div>
          ) : (
            <Select value={materialId} onValueChange={(value) => setMaterialId(value ?? "")}>
              <SelectTrigger className="h-12 w-full px-4 text-base">
                <SelectValue placeholder="Selecione um material">
                  {(value: string | null) =>
                    availableMaterials.find((material) => material.id === value)?.name ?? "Selecione um material"
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
          {materialsError ? (
            <p className="text-xs text-destructive">Não foi possível carregar os materiais agora.</p>
          ) : !isEditing && activeMaterials !== undefined && availableMaterials.length === 0 ? (
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
            {selectedMaterialUnit ? (
              <span className="shrink-0 text-sm font-medium text-muted-foreground">{selectedMaterialUnit}</span>
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

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        size="lg"
        onClick={() => void handleSubmit()}
        disabled={submitting || (!isEditing && (!materialId || materialsError))}
        className="w-full"
      >
        {isEditing ? "Salvar alterações" : "Adicionar material"}
      </Button>

      {isEditing ? (
        <Button type="button" variant="destructive" className="w-full" disabled={deleting} onClick={() => void handleDelete()}>
          Excluir
        </Button>
      ) : null}
    </div>
  );
}

export function RequirementForm({ projectId, requirementId }: { projectId: string; requirementId?: string }) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  const projectIdRef = useRef(projectId);
  const requirementIdRef = useRef(requirementId ?? "new");
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    projectIdRef.current = projectId;
    requirementIdRef.current = requirementId ?? "new";
  }, [activeCompanyId, projectId, requirementId]);

  return (
    <RequirementFormInner
      key={`${activeCompanyId}:${projectId}:${requirementId ?? "new"}`}
      projectId={projectId}
      requirementId={requirementId}
      activeCompanyIdRef={activeCompanyIdRef}
      projectIdRef={projectIdRef}
      requirementIdRef={requirementIdRef}
    />
  );
}
