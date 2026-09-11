"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tags } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ApiValidationError } from "@/lib/api-client";
import { brlInputToDecimalString } from "@/lib/currency";
import { CatalogItemFields, EMPTY_CATALOG_ITEM_FIELDS, type CatalogItemFieldsValue } from "./catalog-item-fields";
import { createCatalogItem } from "./catalog-client";
import type { CatalogItemCreatePayload } from "./types";

function firstError(errors: Record<string, string[]>, key: string): string | null {
  return errors[key]?.[0] ?? null;
}

export function CatalogCreateForm() {
  const router = useRouter();

  const [fields, setFields] = useState<CatalogItemFieldsValue>(EMPTY_CATALOG_ITEM_FIELDS);
  // §35: default ON — the item is available for use as soon as it's created.
  const [active, setActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const canSubmit = fields.name.trim() !== "" && fields.unit.trim() !== "" && !submitting;

  function updateFields(patch: Partial<CatalogItemFieldsValue>) {
    setFields((previous) => ({ ...previous, ...patch }));
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});

    const payload: CatalogItemCreatePayload = {
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
      const created = await createCatalogItem(payload);
      router.push(`/catalogo/${created.id}`);
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFieldErrors(error.errors);
      } else {
        setSubmitError("Não foi possível criar o item agora.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6 pb-6">
      <BackLink title="Novo item" description="Informe o essencial para começar." icon={Tags} href="/catalogo" />

      <CatalogItemFields
        value={fields}
        onChange={updateFields}
        idPrefix="catalog-create"
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
            <label htmlFor="catalog-create-active" className="text-sm font-medium text-foreground">
              Disponível para uso
            </label>
            <p className="text-xs text-muted-foreground">
              Itens inativos permanecem cadastrados, mas não serão oferecidos em novas seleções.
            </p>
          </div>
          <Switch id="catalog-create-active" checked={active} onCheckedChange={setActive} className="shrink-0" />
        </div>
      </div>

      {submitError ? (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      <Button type="button" size="lg" onClick={() => void handleSubmit()} disabled={!canSubmit} className="w-full">
        {submitting ? "Criando..." : "Criar item"}
      </Button>
    </div>
  );
}
