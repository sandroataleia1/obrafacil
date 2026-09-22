"use client";

/**
 * SUPPLY-FRONTEND-01A §24-27/§30/§65-66. Real API create/edit — no
 * browser UUID, no `todayIso()` for timestamps, server is authority.
 * `ownerInner`/outer-wrapper tenant-ownership pattern mirrors
 * `ProjectEditForm` (§65): the outer component owns `activeCompanyIdRef`
 * and force-remounts the inner form on a Company switch OR an id change.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiValidationError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { createMaterial, updateMaterial } from "./materials-client";
import { useMaterial } from "./use-material";
import { MATERIAL_UNIT_CODE_LABEL, MATERIAL_UNIT_CODES } from "./types";
import type { Material, MaterialUnitCode } from "./types";

const UNIT_OPTION_LABEL: Record<MaterialUnitCode, string> = {
  ...MATERIAL_UNIT_CODE_LABEL,
  other: "Outro",
};

function MaterialFormInner({
  materialId,
  onSuccess,
  onCancel,
  activeCompanyIdRef,
}: {
  materialId?: string;
  onSuccess?: (material: Material) => void;
  onCancel?: () => void;
  activeCompanyIdRef: React.RefObject<string | undefined>;
}) {
  const router = useRouter();
  const { material: existingMaterial, error: loadError, reload: reloadMaterial } = useMaterial(materialId ?? "");
  const isEditing = Boolean(materialId);

  const [name, setName] = useState("");
  const [unitCode, setUnitCode] = useState<MaterialUnitCode>("un");
  const [customUnitLabel, setCustomUnitLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!existingMaterial) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(existingMaterial.name);
    setUnitCode(existingMaterial.unit_code);
    setCustomUnitLabel(existingMaterial.unit_custom_label ?? "");
    setNotes(existingMaterial.notes ?? "");
    setActive(existingMaterial.active);
  }, [existingMaterial]);

  const submitCompanyId = activeCompanyIdRef.current;

  const handleSubmit = useCallback(async () => {
    if (name.trim() === "") {
      setError("Informe o nome do material.");
      return;
    }
    if (unitCode === "other" && customUnitLabel.trim() === "") {
      setError("Informe o nome da unidade.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      name: name.trim(),
      unit_code: unitCode,
      unit_custom_label: unitCode === "other" ? customUnitLabel.trim() : null,
      notes: notes.trim() || null,
    };

    try {
      const saved =
        isEditing && existingMaterial
          ? await updateMaterial(existingMaterial.id, { ...payload, active })
          : await createMaterial(payload);

      if (activeCompanyIdRef.current !== submitCompanyId) return;

      setSubmitting(false);
      if (onSuccess) {
        onSuccess(saved);
        return;
      }
      router.push(`/materiais/${saved.id}`);
    } catch (submitError) {
      if (activeCompanyIdRef.current !== submitCompanyId) return;
      setSubmitting(false);
      if (submitError instanceof ApiValidationError) {
        const firstMessage = Object.values(submitError.errors)[0]?.[0];
        setError(firstMessage ?? submitError.serverMessage ?? "Não foi possível salvar. Verifique os campos.");
        return;
      }
      setError("Não foi possível salvar agora. Tente novamente.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, unitCode, customUnitLabel, notes, active, isEditing, existingMaterial]);

  if (isEditing && existingMaterial === undefined && !loadError) return null;

  if (isEditing && loadError) {
    return (
      <div className="space-y-6">
        <BackHeader title="Material" onBack={() => router.push("/materiais")} />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar este material agora.
          </p>
          <Button type="button" onClick={reloadMaterial}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (isEditing && existingMaterial === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Material não encontrado" onBack={() => router.push("/materiais")} />
        <p className="pl-11 text-sm text-muted-foreground">Ele pode ter sido removido ou o link está incorreto.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {onCancel ? null : (
        <div className="space-y-1">
          <BackHeader
            title={isEditing ? "Editar material" : "Novo material"}
            onBack={() => router.push(existingMaterial ? `/materiais/${existingMaterial.id}` : "/materiais")}
          />
        </div>
      )}

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
          <span className="text-sm font-medium text-foreground">Unidade</span>
          <Select value={unitCode} onValueChange={(value) => setUnitCode((value as MaterialUnitCode) ?? "un")}>
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
        </div>

        {unitCode === "other" ? (
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

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {onCancel ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
            {isEditing ? "Salvar alterações" : "Salvar material"}
          </Button>
        </div>
      ) : (
        <Button type="button" size="lg" onClick={() => void handleSubmit()} className="w-full" disabled={submitting}>
          {isEditing ? "Salvar alterações" : "Cadastrar material"}
        </Button>
      )}
    </div>
  );
}

export function MaterialForm({
  materialId,
  onSuccess,
  onCancel,
}: {
  materialId?: string;
  /** When provided (quick-create in a Dialog/Sheet), called with the saved Material instead of navigating. */
  onSuccess?: (material: Material) => void;
  /** When provided, renders a Cancelar action next to the submit button and hides the page-only BackHeader. */
  onCancel?: () => void;
}) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  return (
    <MaterialFormInner
      key={`${activeCompanyId}:${materialId ?? "new"}`}
      materialId={materialId}
      onSuccess={onSuccess}
      onCancel={onCancel}
      activeCompanyIdRef={activeCompanyIdRef}
    />
  );
}
