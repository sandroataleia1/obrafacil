"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { listCatalogItems } from "@/features/catalog/catalog-client";
import type { CatalogItem, CatalogItemType } from "@/features/catalog/types";
import { CATALOG_ITEM_TYPE_LABELS } from "@/features/catalog/labels";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { brlInputToDecimalString, decimalStringToBrlDisplay, decimalStringToMoneyInputValue } from "@/lib/currency";
import { quantityInputToDecimalString } from "@/lib/quantity";
import { computeLinePreview, isDiscountWithinSubtotal } from "../money-preview";
import { addBudgetItem } from "../budgets-client";
import type { BudgetItemAddPayload } from "../types";

const SEARCH_DEBOUNCE_MS = 300;
type TypeFilter = "" | CatalogItemType;

/**
 * "Catálogo" option of the Detail page's "+ Adicionar item" flow (draft
 * only). Server search mirrors `features/service-orders/items/add-item-dialog.tsx`
 * (debounced 3+ chars, tenant-safe via the caller's `requestCompanyId`/
 * `isStaleRequest`, `active=true` only). On submit, POSTs exactly
 * `{ source_type: "catalog", catalog_item_id, quantity, unit_price,
 * line_discount, notes }` — never `name`/`code`/`unit`/`description`/
 * `unit_cost`/`calculation_snapshot` (all prohibited server-side for
 * source_type "catalog"). Never offers a cost input — cost always
 * mirrors `CatalogItem.cost_price` server-side. The response only
 * carries the created item, never the Budget's new totals — the caller
 * (`onAdded`) is responsible for re-GETting the Budget.
 */
export function AddCatalogItemDialog({
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
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [lineDiscountInput, setLineDiscountInput] = useState("0,00");
  const [notesInput, setNotesInput] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [catalogItemError, setCatalogItemError] = useState<string | null>(null);

  const searchSequence = useRef(0);

  function resetAll() {
    setSearchInput("");
    setSearch("");
    setTypeFilter("");
    setResults([]);
    setLoading(false);
    setSearchError(false);
    setPicked(null);
    setQuantityInput("1");
    setUnitPriceInput("");
    setLineDiscountInput("0,00");
    setNotesInput("");
    setSubmitting(false);
    setSubmitError(null);
    setCatalogItemError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetAll();
    onOpenChange(next);
  }

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (search.length < 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setSearchError(false);
      return;
    }
    const requestId = ++searchSequence.current;
    const fireCompanyId = requestCompanyId;
    setLoading(true);
    setSearchError(false);
    listCatalogItems({ search, active: true, type: typeFilter || undefined, page: 1, perPage: 15 })
      .then((response) => {
        if (searchSequence.current !== requestId || isStaleRequest(fireCompanyId)) return;
        setResults(response.data);
      })
      .catch(() => {
        if (searchSequence.current !== requestId || isStaleRequest(fireCompanyId)) return;
        setSearchError(true);
      })
      .finally(() => {
        if (searchSequence.current !== requestId || isStaleRequest(fireCompanyId)) return;
        setLoading(false);
      });
  }, [search, typeFilter, requestCompanyId, isStaleRequest]);

  function pickItem(item: CatalogItem) {
    setPicked(item);
    setQuantityInput("1");
    setUnitPriceInput(decimalStringToMoneyInputValue(item.sale_price));
    setLineDiscountInput("0,00");
    setNotesInput("");
    setCatalogItemError(null);
  }

  const quantity = quantityInputToDecimalString(quantityInput);
  const unitPrice = brlInputToDecimalString(unitPriceInput);
  const lineDiscount = brlInputToDecimalString(lineDiscountInput) ?? "0.00";
  const grossLine =
    quantity !== null && unitPrice !== null ? computeLinePreview({ quantity, unitPrice, lineDiscount }).grossLine : null;
  const discountValid = grossLine !== null && isDiscountWithinSubtotal(lineDiscount, grossLine);
  const canSubmit = picked !== null && quantity !== null && unitPrice !== null && discountValid && !submitting;

  async function handleSubmit() {
    if (!picked || quantity === null || unitPrice === null || !discountValid) return;
    const requestCompanyIdAtSubmit = requestCompanyId;
    setSubmitting(true);
    setSubmitError(null);
    setCatalogItemError(null);
    const payload: BudgetItemAddPayload = {
      source_type: "catalog",
      catalog_item_id: picked.id,
      quantity,
      unit_price: unitPrice,
      line_discount: lineDiscount,
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
      if (error instanceof ApiValidationError) {
        const message = error.errors.catalog_item_id?.[0];
        setCatalogItemError(message ?? null);
        if (!message) setSubmitError("Não foi possível adicionar este item agora.");
      } else {
        setSubmitError("Não foi possível adicionar este item agora.");
      }
    } finally {
      if (!isStaleRequest(requestCompanyIdAtSubmit)) setSubmitting(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Adicionar item do catálogo"
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
        {!picked ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Buscar produto ou serviço"
                aria-label="Buscar produto ou serviço"
                className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-1.5">
              {(["", "product", "service"] as TypeFilter[]).map((value) => (
                <button
                  key={value || "all"}
                  type="button"
                  onClick={() => setTypeFilter(value)}
                  aria-pressed={typeFilter === value}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    typeFilter === value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {value === "" ? "Todos" : value === "product" ? "Produtos" : "Serviços"}
                </button>
              ))}
            </div>
            {searchError ? (
              <p role="alert" className="text-sm text-destructive">
                Não foi possível buscar o catálogo agora.
              </p>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Buscando...</p>
            ) : results.length > 0 ? (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {results.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {CATALOG_ITEM_TYPE_LABELS[item.type]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[item.code, item.unit, decimalStringToBrlDisplay(item.sale_price)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => pickItem(item)}>
                      Selecionar
                    </Button>
                  </li>
                ))}
              </ul>
            ) : search.length >= 3 ? (
              <p className="text-sm text-muted-foreground">Nenhum item encontrado para &quot;{search}&quot;.</p>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 rounded-xl border border-primary bg-primary/5 p-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{picked.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[picked.code, picked.unit, CATALOG_ITEM_TYPE_LABELS[picked.type]].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(null)}>
                Trocar
              </Button>
            </div>
            {catalogItemError ? (
              <p role="alert" className="text-xs text-destructive">
                {catalogItemError}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="budget-add-catalog-qty" className="text-sm font-medium text-foreground">
                  Quantidade
                </label>
                <input
                  id="budget-add-catalog-qty"
                  type="text"
                  inputMode="decimal"
                  value={quantityInput}
                  onChange={(event) => setQuantityInput(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
              </div>
              <MoneyField id="budget-add-catalog-price" label="Preço unitário" value={unitPriceInput} onChange={setUnitPriceInput} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MoneyField id="budget-add-catalog-discount" label="Desconto da linha" value={lineDiscountInput} onChange={setLineDiscountInput} />
              <div className="space-y-1.5">
                <label htmlFor="budget-add-catalog-notes" className="text-sm font-medium text-foreground">
                  Observação
                </label>
                <input
                  id="budget-add-catalog-notes"
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
          </>
        )}
        {submitError ? (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
