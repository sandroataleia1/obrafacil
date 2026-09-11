"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import {
  CatalogItemFields,
  EMPTY_CATALOG_ITEM_FIELDS,
  type CatalogItemFieldsValue,
} from "@/features/catalog/catalog-item-fields";
import { createCatalogItem } from "@/features/catalog/catalog-client";
import type { CatalogItem, CatalogItemType } from "@/features/catalog/types";
import { ApiValidationError } from "@/lib/api-client";
import { brlInputToDecimalString } from "@/lib/currency";

/**
 * Quick "+ Novo produto" / "+ Novo serviço" dialog for wizard step 3 —
 * same component for both, pre-set via `presetType`. POSTs via the
 * canonical `/catalog-items` endpoint; `active` is always sent as
 * `true`. "Salvar e adicionar à O.S." both creates the item AND adds it
 * straight to the wizard's draft in one action.
 */
export function QuickCatalogDialog({
  open,
  onOpenChange,
  presetType,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetType: CatalogItemType;
  onCreated: (item: CatalogItem) => void;
}) {
  const [fields, setFields] = useState<CatalogItemFieldsValue>({ ...EMPTY_CATALOG_ITEM_FIELDS, type: presetType });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setFields((current) => ({ ...current, type: presetType }));
  }, [open, presetType]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFields({ ...EMPTY_CATALOG_ITEM_FIELDS, type: presetType });
      setSubmitError(null);
      setFieldErrors({});
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (fields.name.trim() === "" || fields.unit.trim() === "") return;
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const created = await createCatalogItem({
        type: fields.type,
        code: fields.code.trim() || null,
        name: fields.name.trim(),
        category: fields.category.trim() || null,
        unit: fields.unit.trim(),
        description: fields.description.trim() || null,
        // §: cost price is secondary and may be omitted from quick create.
        cost_price: brlInputToDecimalString(fields.costPriceInput),
        sale_price: brlInputToDecimalString(fields.salePriceInput),
        active: true,
      });
      onCreated(created);
      handleOpenChange(false);
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
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={presetType === "product" ? "Novo produto" : "Novo serviço"}
      showClose
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || fields.name.trim() === "" || fields.unit.trim() === ""}
          >
            {submitting ? "Criando..." : "Salvar e adicionar à O.S."}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-1">
        <CatalogItemFields
          value={fields}
          onChange={(patch) => setFields((current) => ({ ...current, ...patch }))}
          idPrefix="quick-catalog"
          nameError={fieldErrors.name?.[0]}
          unitError={fieldErrors.unit?.[0]}
          codeError={fieldErrors.code?.[0]}
          costPriceError={fieldErrors.cost_price?.[0]}
          salePriceError={fieldErrors.sale_price?.[0]}
        />
        {submitError ? (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
