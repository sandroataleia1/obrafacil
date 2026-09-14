"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { ApiError } from "@/lib/api-client";
import { brlInputToDecimalString, decimalStringToMoneyInputValue } from "@/lib/currency";
import { decimalStringToQuantityInputValue, quantityInputToDecimalString } from "@/lib/quantity";
import { computeLinePreview, isDiscountWithinSubtotal } from "../money-preview";
import { updateBudgetItem } from "../budgets-client";
import type { BudgetItem, BudgetItemUpdatePayload } from "../types";

const SOURCE_TYPE_LABEL: Record<BudgetItem["source_type"], string> = {
  catalog: "Catálogo",
  calculator: "Calculadora",
  manual: "Manual",
};

/**
 * Edit dialog for one existing Budget line item (draft only, ANY
 * `source_type`) — `UpdateBudgetItemRequest` accepts ONLY quantity/
 * unit_price/line_discount/notes/sort_order; every creation-time
 * snapshot field (`source_type`/`catalog_item_id`/`calculator_type`/
 * `code`/`name`/`unit`/`description`/`unit_cost`/`calculation_snapshot`)
 * is `prohibited` server-side, so this dialog renders those as read-only
 * context only — never as an editable input, for every item regardless
 * of its source. On submit, PUTs exactly `{ quantity, unit_price,
 * line_discount, notes }`. The response only carries the updated item,
 * never the Budget's new totals — the caller (`onUpdated`) is
 * responsible for re-GETting the Budget.
 */
export function EditItemDialog({
  open,
  onOpenChange,
  budgetId,
  item,
  requestCompanyId,
  isStaleRequest,
  onUpdated,
  onConflict,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  item: BudgetItem;
  requestCompanyId: string | undefined;
  isStaleRequest: (requestCompanyId: string | undefined) => boolean;
  onUpdated: () => void;
  onConflict: (message: string) => void;
}) {
  const [quantityInput, setQuantityInput] = useState(decimalStringToQuantityInputValue(item.quantity));
  const [unitPriceInput, setUnitPriceInput] = useState(decimalStringToMoneyInputValue(item.unit_price));
  const [lineDiscountInput, setLineDiscountInput] = useState(decimalStringToMoneyInputValue(item.line_discount));
  const [notesInput, setNotesInput] = useState(item.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Re-prefill whenever a DIFFERENT item is opened — never carry a
  // previous item's edited-but-uncommitted values into a new one.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuantityInput(decimalStringToQuantityInputValue(item.quantity));
    setUnitPriceInput(decimalStringToMoneyInputValue(item.unit_price));
    setLineDiscountInput(decimalStringToMoneyInputValue(item.line_discount));
    setNotesInput(item.notes ?? "");
    setSubmitError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item.id]);

  function handleOpenChange(next: boolean) {
    if (!next) setSubmitError(null);
    onOpenChange(next);
  }

  const quantity = quantityInputToDecimalString(quantityInput);
  const unitPrice = brlInputToDecimalString(unitPriceInput);
  const lineDiscount = brlInputToDecimalString(lineDiscountInput) ?? "0.00";
  const grossLine =
    quantity !== null && unitPrice !== null ? computeLinePreview({ quantity, unitPrice, lineDiscount }).grossLine : null;
  const discountValid = grossLine !== null && isDiscountWithinSubtotal(lineDiscount, grossLine);
  const canSubmit = quantity !== null && unitPrice !== null && discountValid && !submitting;

  async function handleSubmit() {
    if (quantity === null || unitPrice === null || !discountValid) return;
    const requestCompanyIdAtSubmit = requestCompanyId;
    setSubmitting(true);
    setSubmitError(null);
    const payload: BudgetItemUpdatePayload = {
      quantity,
      unit_price: unitPrice,
      line_discount: lineDiscount,
      notes: notesInput.trim() || null,
    };
    try {
      await updateBudgetItem(budgetId, item.id, payload);
      if (isStaleRequest(requestCompanyIdAtSubmit)) return;
      handleOpenChange(false);
      onUpdated();
    } catch (error) {
      if (isStaleRequest(requestCompanyIdAtSubmit)) return;
      if (error instanceof ApiError && error.status === 409) {
        handleOpenChange(false);
        onConflict("O orçamento foi alterado por outro usuário.");
        return;
      }
      setSubmitError("Não foi possível salvar este item agora.");
    } finally {
      if (!isStaleRequest(requestCompanyIdAtSubmit)) setSubmitting(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Editar item"
      showClose
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {submitting ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="rounded-xl border border-border bg-muted/30 p-3.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {SOURCE_TYPE_LABEL[item.source_type]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{[item.code, item.unit].filter(Boolean).join(" · ")}</p>
          {item.description ? <p className="pt-1 text-xs text-muted-foreground">{item.description}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="budget-edit-item-qty" className="text-sm font-medium text-foreground">
              Quantidade
            </label>
            <input
              id="budget-edit-item-qty"
              type="text"
              inputMode="decimal"
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
          <MoneyField id="budget-edit-item-price" label="Preço unitário" value={unitPriceInput} onChange={setUnitPriceInput} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MoneyField id="budget-edit-item-discount" label="Desconto da linha" value={lineDiscountInput} onChange={setLineDiscountInput} />
          <div className="space-y-1.5">
            <label htmlFor="budget-edit-item-notes" className="text-sm font-medium text-foreground">
              Observação
            </label>
            <input
              id="budget-edit-item-notes"
              type="text"
              value={notesInput}
              onChange={(event) => setNotesInput(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        {quantity === null || unitPrice === null ? (
          <p role="alert" className="text-xs text-destructive">
            Informe uma quantidade e um preço unitário válidos.
          </p>
        ) : !discountValid ? (
          <p role="alert" className="text-xs text-destructive">
            O desconto não pode ser maior que o valor da linha.
          </p>
        ) : null}
        {submitError ? (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
