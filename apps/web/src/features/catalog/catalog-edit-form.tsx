"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Tags } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { brlInputToDecimalString, decimalStringToMoneyInputValue } from "@/lib/currency";
import { getCatalogItem, updateCatalogItem } from "./catalog-client";
import { CatalogItemFields, EMPTY_CATALOG_ITEM_FIELDS, type CatalogItemFieldsValue } from "./catalog-item-fields";
import type { CatalogItemUpdatePayload } from "./types";

function firstError(errors: Record<string, string[]>, key: string): string | null {
  return errors[key]?.[0] ?? null;
}

export function CatalogEditForm({ catalogItemId }: { catalogItemId: string }) {
  const router = useRouter();
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<"loading" | "success" | "error" | "not_found">("loading");
  // §48: set on every settled outcome (success, 404, or error) — not
  // only success — so a failure never gets masked behind the loading
  // skeleton forever, and never shown for a tenant switched away from.
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | undefined>(undefined);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const [fields, setFields] = useState<CatalogItemFieldsValue>(EMPTY_CATALOG_ITEM_FIELDS);
  const [active, setActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    // §48: never keep the previous tenant's form populated while the new
    // GET is in flight — invalidate immediately.
    setStatus("loading");
    try {
      const item = await getCatalogItem(catalogItemId);
      if (requestSequence.current !== requestId) return;
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      setFields({
        type: item.type,
        code: item.code ?? "",
        name: item.name,
        category: item.category ?? "",
        unit: item.unit,
        description: item.description ?? "",
        costPriceInput: decimalStringToMoneyInputValue(item.cost_price),
        salePriceInput: decimalStringToMoneyInputValue(item.sale_price),
      });
      setActive(item.active);
      setResolvedCompanyId(requestCompanyId);
      setStatus("success");
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      setResolvedCompanyId(requestCompanyId);
      if (error instanceof ApiError && error.status === 404) {
        setStatus("not_found");
        return;
      }
      setStatus("error");
    }
  }, [catalogItemId, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const isCurrentTenant = resolvedCompanyId !== undefined && resolvedCompanyId === activeCompanyId;

  function updateFields(patch: Partial<CatalogItemFieldsValue>) {
    setFields((previous) => ({ ...previous, ...patch }));
  }

  async function handleSubmit() {
    if (fields.name.trim() === "" || fields.unit.trim() === "" || saving) return;

    setSaving(true);
    setSaveError(null);
    setFieldErrors({});

    const payload: CatalogItemUpdatePayload = {
      type: fields.type,
      code: fields.code.trim() || null,
      name: fields.name.trim(),
      category: fields.category.trim() || null,
      unit: fields.unit.trim(),
      description: fields.description.trim() || null,
      cost_price: brlInputToDecimalString(fields.costPriceInput),
      sale_price: brlInputToDecimalString(fields.salePriceInput),
      active,
    };

    try {
      await updateCatalogItem(catalogItemId, payload);
      router.push(`/catalogo/${catalogItemId}`);
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFieldErrors(error.errors);
      } else {
        setSaveError("Não foi possível salvar as alterações agora.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading" || !isCurrentTenant) {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <span className="sr-only">Carregando item</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <EmptyState icon={Tags} title="Item não encontrado" description="Ele pode ter sido removido ou o link está incorreto." />
    );
  }

  if (status === "error") {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          Não foi possível carregar este item agora.
        </p>
        <Button type="button" onClick={() => void load()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 pb-6">
      <BackLink title="Editar item" icon={Tags} href={`/catalogo/${catalogItemId}`} />

      <CatalogItemFields
        value={fields}
        onChange={updateFields}
        idPrefix="catalog-edit"
        nameError={firstError(fieldErrors, "name")}
        unitError={firstError(fieldErrors, "unit")}
        codeError={firstError(fieldErrors, "code")}
        costPriceError={firstError(fieldErrors, "cost_price")}
        salePriceError={firstError(fieldErrors, "sale_price")}
      />

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Disponibilidade</h2>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
          <div className="min-w-0 space-y-0.5">
            <label htmlFor="catalog-edit-active" className="text-sm font-medium text-foreground">
              Disponível para uso
            </label>
            <p className="text-xs text-muted-foreground">
              Itens inativos permanecem cadastrados, mas não serão oferecidos em novas seleções.
            </p>
          </div>
          <Switch id="catalog-edit-active" checked={active} onCheckedChange={setActive} className="shrink-0" />
        </div>
      </div>

      {saveError ? (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => router.push(`/catalogo/${catalogItemId}`)}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={fields.name.trim() === "" || saving}>
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
