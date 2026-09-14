"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { ApiError } from "@/lib/api-client";
import { brlInputToDecimalString } from "@/lib/currency";
import { quantityInputToDecimalString } from "@/lib/quantity";
import { computeLinePreview, isDiscountWithinSubtotal } from "../money-preview";
import { addBudgetItem } from "../budgets-client";
import type { BudgetItemAddPayload } from "../types";

/**
 * "Item manual" option of the Detail page's "+ Adicionar item" flow
 * (draft only). Fields: Nome (required), Quantidade (required), Unidade,
 * Preço unitário (required), Custo unitário interno, Desconto da linha,
 * Descrição, Observação. When "Custo
 * unitário interno" is left empty, sends `unit_cost: null` explicitly —
 * NEVER `0` (that would silently claim a real zero cost the user never
 * stated, corrupting the Budget's margin calculation). On submit, POSTs
 * exactly `{ source_type: "manual", name, quantity, unit, unit_price,
 * unit_cost, line_discount, description, notes }`. The response only
 * carries the created item, never the Budget's new totals — the caller
 * (`onAdded`) is responsible for re-GETting the Budget.
 */
export function AddManualItemDialog({
  open,
  onOpenChange,
  budgetId,
  requestCompanyId,
  isStaleRequest,
  onAdded,
  onConflict,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  requestCompanyId: string | undefined;
  isStaleRequest: (requestCompanyId: string | undefined) => boolean;
  onAdded: () => void;
  onConflict: (message: string) => void;
}) {
  const [nameInput, setNameInput] = useState("");
  const [quantityInput, setQuantityInput] = useState("1");
  const [unitInput, setUnitInput] = useState("");
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [unitCostInput, setUnitCostInput] = useState("");
  const [lineDiscountInput, setLineDiscountInput] = useState("0,00");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function resetAll() {
    setNameInput("");
    setQuantityInput("1");
    setUnitInput("");
    setUnitPriceInput("");
    setUnitCostInput("");
    setLineDiscountInput("0,00");
    setDescriptionInput("");
    setNotesInput("");
    setSubmitting(false);
    setSubmitError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetAll();
    onOpenChange(next);
  }

  const name = nameInput.trim();
  const quantity = quantityInputToDecimalString(quantityInput);
  const unitPrice = brlInputToDecimalString(unitPriceInput);
  // Cost is genuinely optional — an empty field must resolve to `null`,
  // never "0.00" (which would claim a real zero cost).
  const unitCost = unitCostInput.trim() === "" ? null : brlInputToDecimalString(unitCostInput);
  const unitCostInvalid = unitCostInput.trim() !== "" && unitCost === null;
  const lineDiscount = brlInputToDecimalString(lineDiscountInput) ?? "0.00";
  const grossLine =
    quantity !== null && unitPrice !== null ? computeLinePreview({ quantity, unitPrice, lineDiscount }).grossLine : null;
  const discountValid = grossLine !== null && isDiscountWithinSubtotal(lineDiscount, grossLine);
  const canSubmit =
    name !== "" && quantity !== null && unitPrice !== null && !unitCostInvalid && discountValid && !submitting;

  async function handleSubmit() {
    if (name === "" || quantity === null || unitPrice === null || unitCostInvalid || !discountValid) return;
    const requestCompanyIdAtSubmit = requestCompanyId;
    setSubmitting(true);
    setSubmitError(null);
    const payload: BudgetItemAddPayload = {
      source_type: "manual",
      name,
      quantity,
      unit: unitInput.trim() || null,
      unit_price: unitPrice,
      unit_cost: unitCost,
      line_discount: lineDiscount,
      description: descriptionInput.trim() || null,
      notes: notesInput.trim() || null,
    };
    try {
      await addBudgetItem(budgetId, payload);
      if (isStaleRequest(requestCompanyIdAtSubmit)) return;
      handleOpenChange(false);
      onAdded();
    } catch (error) {
      if (isStaleRequest(requestCompanyIdAtSubmit)) return;
      if (error instanceof ApiError && error.status === 409) {
        handleOpenChange(false);
        onConflict("O orçamento foi alterado por outro usuário.");
        return;
      }
      setSubmitError("Não foi possível adicionar este item agora.");
    } finally {
      if (!isStaleRequest(requestCompanyIdAtSubmit)) setSubmitting(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Adicionar item manual"
      showClose
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {submitting ? "Adicionando..." : "Adicionar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="space-y-1.5">
          <label htmlFor="budget-add-manual-name" className="text-sm font-medium text-foreground">
            Nome
          </label>
          <input
            id="budget-add-manual-name"
            type="text"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="budget-add-manual-qty" className="text-sm font-medium text-foreground">
              Quantidade
            </label>
            <input
              id="budget-add-manual-qty"
              type="text"
              inputMode="decimal"
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="budget-add-manual-unit" className="text-sm font-medium text-foreground">
              Unidade
            </label>
            <input
              id="budget-add-manual-unit"
              type="text"
              value={unitInput}
              onChange={(event) => setUnitInput(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MoneyField id="budget-add-manual-price" label="Preço unitário" value={unitPriceInput} onChange={setUnitPriceInput} />
          <div className="space-y-1.5">
            <MoneyField id="budget-add-manual-cost" label="Custo unitário interno" value={unitCostInput} onChange={setUnitCostInput} />
            <p className="text-xs text-muted-foreground">Sem custo, a margem total ficará indisponível.</p>
          </div>
        </div>

        <MoneyField id="budget-add-manual-discount" label="Desconto da linha" value={lineDiscountInput} onChange={setLineDiscountInput} />

        <div className="space-y-1.5">
          <label htmlFor="budget-add-manual-description" className="text-sm font-medium text-foreground">
            Descrição
          </label>
          <input
            id="budget-add-manual-description"
            type="text"
            value={descriptionInput}
            onChange={(event) => setDescriptionInput(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="budget-add-manual-notes" className="text-sm font-medium text-foreground">
            Observação
          </label>
          <input
            id="budget-add-manual-notes"
            type="text"
            value={notesInput}
            onChange={(event) => setNotesInput(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {name === "" || quantity === null || unitPrice === null || unitCostInvalid ? (
          <p role="alert" className="text-xs text-destructive">
            {unitCostInvalid
              ? "Informe um custo unitário válido ou deixe o campo vazio."
              : "Informe nome, quantidade e preço unitário válidos."}
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
