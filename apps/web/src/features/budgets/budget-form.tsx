"use client";

/**
 * §19-29 NOVO ORÇAMENTO — real POST /budgets. Replaces the old
 * localStorage prototype entirely: this component is CREATE-ONLY now
 * (header edit for an existing draft lives in its own component,
 * `edit-budget-header-form.tsx`, wired to the separate `/editar`
 * route — the two flows send different payloads to different
 * endpoints and terminal-status handling differs, so keeping them
 * merged like the old prototype did was actively misleading).
 *
 * §4 CALCULATOR HANDOFF: the pending item from sessionStorage
 * (`prototype/pending-budget-item.ts`) is read once on mount and, if
 * present, included in the SAME POST as the Budget itself (§26 —
 * atomic, never a second request). It is cleared ONLY after a
 * successful 201 (§27); an error preserves it (§28); a Company switch
 * during the POST must never let the response apply under the wrong
 * Company (§79).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { BackLink } from "@/components/shared/back-link";
import { useAuth } from "@/features/auth/auth-provider";
import { getCustomer } from "@/features/customers/customers-client";
import type { Customer, CustomerListItem } from "@/features/customers/types";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { brlInputToDecimalString } from "@/lib/currency";
import { BudgetCustomerPicker } from "./components/budget-customer-picker";
import { PendingItemPreview } from "./components/pending-item-preview";
import { createBudget } from "./budgets-client";
import { calculatorItemToBudgetItemPayload } from "./lib/calculator-item-adapter";
import { clearPendingBudgetItem, getPendingBudgetItem, type PendingBudgetItem } from "./prototype/pending-budget-item";
import type { BudgetItemCreatePayload } from "./types";

export function BudgetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCustomerId = searchParams.get("customerId") ?? "";

  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);
  const isStaleRequest = useCallback(
    (requestCompanyId: string | undefined) => activeCompanyIdRef.current !== requestCompanyId,
    []
  );

  const [pendingItem, setPendingItem] = useState<PendingBudgetItem | null | undefined>(undefined);
  const [calculatorItemRemoved, setCalculatorItemRemoved] = useState(false);
  const [calculatorPrice, setCalculatorPrice] = useState("");

  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState<CustomerListItem | Customer | null>(null);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [discountInput, setDiscountInput] = useState("");

  const [preselectError, setPreselectError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // sessionStorage read after mount only — server/hydration both
    // render `undefined` first, so there is no mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingItem(getPendingBudgetItem());
  }, []);

  // §23 PRESELECT CUSTOMER — /orcamentos/novo?customerId=UUID. Loads
  // and validates the real Customer; a cross-tenant/not-found id is
  // never used silently.
  useEffect(() => {
    if (!preselectedCustomerId) return;
    const requestCompanyId = activeCompanyId;
    getCustomer(preselectedCustomerId)
      .then((found) => {
        if (isStaleRequest(requestCompanyId)) return;
        setCustomer(found);
      })
      .catch(() => {
        if (isStaleRequest(requestCompanyId)) return;
        setPreselectError("Não foi possível carregar o cliente selecionado. Escolha um cliente abaixo.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedCustomerId]);

  const hasCalculatorItem = Boolean(pendingItem) && !calculatorItemRemoved;
  const calculatorPriceValid = brlInputToDecimalString(calculatorPrice) !== null;
  const canSubmit =
    title.trim() !== "" && customer !== null && (!hasCalculatorItem || calculatorPriceValid) && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !customer) return;

    const requestCompanyId = activeCompanyId;
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const items: BudgetItemCreatePayload[] = [];
    if (hasCalculatorItem && pendingItem) {
      const decimalPrice = brlInputToDecimalString(calculatorPrice);
      if (decimalPrice) {
        items.push(calculatorItemToBudgetItemPayload(pendingItem, decimalPrice));
      }
    }

    const discountDecimal = brlInputToDecimalString(discountInput) ?? "0.00";

    try {
      const created = await createBudget({
        customer_id: customer.id,
        title: title.trim(),
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        discount_amount: discountDecimal,
        items,
      });

      // §79: never navigate into a Budget created under a Company the
      // user has since switched away from.
      if (isStaleRequest(requestCompanyId)) return;

      // §27: clear the handoff only after the POST actually succeeded.
      clearPendingBudgetItem();
      router.push(`/orcamentos/${created.id}`);
    } catch (caught) {
      if (isStaleRequest(requestCompanyId)) return;

      if (caught instanceof ApiValidationError) {
        setFieldErrors(caught.errors);
        setError("Verifique os campos destacados.");
      } else if (caught instanceof ApiError) {
        setError(caught.message || "Não foi possível criar o orçamento.");
      } else {
        setError("Não foi possível criar o orçamento. Verifique sua conexão e tente novamente.");
      }
    } finally {
      if (!isStaleRequest(requestCompanyId)) setSubmitting(false);
    }
  }

  const calculatorItemErrors = fieldErrors["items.0.calculation_snapshot"] ?? fieldErrors["items.0.unit_price"];

  return (
    <div className="space-y-6">
      <BackLink href="/orcamentos" title="Novo orçamento" />

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Novo orçamento</h1>
        <p className="text-sm text-muted-foreground">Informe o essencial para criar a proposta.</p>
      </div>

      {hasCalculatorItem && pendingItem ? (
        <div className="space-y-3">
          <PendingItemPreview item={pendingItem} />
          <div className="space-y-1.5">
            <MoneyField
              id="calculator-item-price"
              label="Preço de venda deste item"
              value={calculatorPrice}
              onChange={setCalculatorPrice}
            />
            <p className="text-xs text-muted-foreground">
              Os quantitativos do cálculo serão salvos junto ao item.
            </p>
            {calculatorItemErrors ? <p className="text-sm text-destructive">{calculatorItemErrors[0]}</p> : null}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setCalculatorItemRemoved(true)}>
            Remover item do cálculo
          </Button>
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="budget-title" className="text-sm font-medium text-foreground">
            Título
          </label>
          <input
            id="budget-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Reforma Casa Oliveira"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldErrors.title ? <p className="text-sm text-destructive">{fieldErrors.title[0]}</p> : null}
        </div>

        {preselectError ? <p className="text-sm text-destructive">{preselectError}</p> : null}
        <BudgetCustomerPicker
          selected={customer}
          onSelect={setCustomer}
          requestCompanyId={activeCompanyId}
          isStaleRequest={isStaleRequest}
        />
        {fieldErrors.customer_id ? <p className="text-sm text-destructive">{fieldErrors.customer_id[0]}</p> : null}

        <div className="space-y-1.5">
          <label htmlFor="budget-reference" className="text-sm font-medium text-foreground">
            Referência <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="budget-reference"
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Casa de praia, Loja Centro, Reforma 2º andar"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldErrors.reference ? <p className="text-sm text-destructive">{fieldErrors.reference[0]}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="budget-notes" className="text-sm font-medium text-foreground">
            Observações <span className="text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            id="budget-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldErrors.notes ? <p className="text-sm text-destructive">{fieldErrors.notes[0]}</p> : null}
        </div>

        <MoneyField id="budget-discount" label="Desconto global (opcional)" value={discountInput} onChange={setDiscountInput} />
        {fieldErrors.discount_amount ? <p className="text-sm text-destructive">{fieldErrors.discount_amount[0]}</p> : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <Button type="button" size="lg" onClick={handleSubmit} disabled={!canSubmit} className="w-full">
        {submitting ? "Criando..." : "Criar orçamento"}
      </Button>
    </div>
  );
}
