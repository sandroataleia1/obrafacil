"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { listCatalogItems } from "@/features/catalog/catalog-client";
import type { CatalogItem, CatalogItemType } from "@/features/catalog/types";
import { CATALOG_ITEM_TYPE_LABELS } from "@/features/catalog/labels";
import { brlInputToDecimalString, decimalStringToBrlDisplay, decimalStringToMoneyInputValue } from "@/lib/currency";
import { quantityInputToDecimalString } from "@/lib/quantity";
import { computeLinePreview } from "../money-preview";
import { newClientId, type DraftItem } from "./wizard-types";
import { QuickCatalogDialog } from "./quick-catalog-dialog";

const SEARCH_DEBOUNCE_MS = 300;
/** Matches the customer search's own minimum (`step-customer.tsx`) —
 * both autocompletes in this wizard behave the same way. */
const MIN_SEARCH_LENGTH = 3;

type TypeFilter = "" | CatalogItemType;

function lineIsValid(item: DraftItem): boolean {
  const quantity = quantityInputToDecimalString(item.quantityInput);
  const unitPrice = brlInputToDecimalString(item.unitPriceInput);
  return quantity !== null && unitPrice !== null;
}

function draftLineTotal(item: DraftItem): string | null {
  const quantity = quantityInputToDecimalString(item.quantityInput);
  const unitPrice = brlInputToDecimalString(item.unitPriceInput);
  const lineDiscount = brlInputToDecimalString(item.lineDiscountInput) ?? "0.00";
  if (quantity === null || unitPrice === null) return null;
  return computeLinePreview({ quantity, unitPrice, lineDiscount }).lineTotal;
}

export function StepItems({
  items,
  onAdd,
  onUpdate,
  onRemove,
  requestCompanyId,
  isStaleRequest,
}: {
  items: DraftItem[];
  onAdd: (item: DraftItem) => void;
  onUpdate: (clientId: string, patch: Partial<DraftItem>) => void;
  onRemove: (clientId: string) => void;
  /** Captured by the caller at fire time — see `ServiceOrderWizard`'s tenant-safety contract. */
  requestCompanyId: string | undefined;
  /** True once the active company no longer matches `requestCompanyId`. */
  isStaleRequest: (requestCompanyId: string | undefined) => boolean;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [quickDialog, setQuickDialog] = useState<CatalogItemType | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const searchSequence = useRef(0);
  /** Bump this whenever the "current search" is semantically invalidated
   * WITHOUT a new search necessarily firing (query shortened below the
   * minimum, Escape, an item being added, a tenant switch) — clearing
   * visual state alone never cancels an in-flight Promise, so every such
   * site must also call this, or a stale response can still resolve
   * into `setResults`/etc. after the fact. */
  const invalidateSearch = useCallback(() => {
    searchSequence.current += 1;
  }, []);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // §Tenant safety: this component can stay mounted across a company
  // switch (the user sitting on step 3) — a late Company-A search result
  // must never populate Company B's catalog list.
  const stepItemsCompanyIdRef = useRef(requestCompanyId);
  useEffect(() => {
    if (stepItemsCompanyIdRef.current === requestCompanyId) return;
    stepItemsCompanyIdRef.current = requestCompanyId;
    invalidateSearch();
    setSearchInput("");
    setSearch("");
    setResults([]);
    setLoading(false);
    setError(false);
    setQuickDialog(null);
  }, [requestCompanyId, invalidateSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlightedIndex(0);
  }, [results]);

  useEffect(() => {
    if (search.length < MIN_SEARCH_LENGTH) {
      invalidateSearch();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setError(false);
      setLoading(false);
      return;
    }
    const requestId = ++searchSequence.current;
    // Captured at fire time, alongside the sequence number — a response
    // is only ever accepted when BOTH still match at settle time.
    const fireCompanyId = requestCompanyId;
    setLoading(true);
    setError(false);
    listCatalogItems({ search, active: true, type: typeFilter || undefined, page: 1, perPage: 15 })
      .then((response) => {
        if (searchSequence.current !== requestId) return;
        if (isStaleRequest(fireCompanyId)) return;
        setResults(response.data);
      })
      .catch(() => {
        if (searchSequence.current !== requestId) return;
        if (isStaleRequest(fireCompanyId)) return;
        setError(true);
      })
      .finally(() => {
        if (searchSequence.current !== requestId) return;
        if (isStaleRequest(fireCompanyId)) return;
        setLoading(false);
      });
  }, [search, typeFilter, requestCompanyId, isStaleRequest, invalidateSearch]);

  /** Adds the item to the draft AND closes/clears the search UI — the
   * result list and "Itens adicionados" must never visually compete for
   * the same item. `typeFilter` is intentionally left untouched so a new
   * search starts from the same filter the user had picked. */
  function addCatalogItem(item: CatalogItem) {
    // Covers add-via-click, add-via-Enter, and add-via-Quick-Product/
    // Service creation alike, since all three funnel through this one
    // function — an earlier in-flight catalog search must never
    // repopulate the list this just cleared.
    invalidateSearch();
    onAdd({
      clientId: newClientId(),
      catalogItemId: item.id,
      type: item.type,
      code: item.code,
      name: item.name,
      unit: item.unit,
      quantityInput: "1",
      unitPriceInput: decimalStringToMoneyInputValue(item.sale_price),
      lineDiscountInput: "0,00",
      notes: "",
    });
    setSearchInput("");
    setSearch("");
    setResults([]);
    setLoading(false);
    setError(false);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function handleQuickCreated(item: CatalogItem) {
    // Belt-and-suspenders — `QuickCatalogDialog` already discards a
    // stale response itself and never calls `onCreated` in that case.
    if (isStaleRequest(requestCompanyId)) return;
    addCatalogItem(item);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const candidate = results[highlightedIndex] ?? results[0];
      if (candidate) addCatalogItem(candidate);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      invalidateSearch();
      setSearchInput("");
      setSearch("");
      setResults([]);
      setError(false);
      return;
    }
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    }
  }

  const trimmedSearch = search;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Buscar produto ou serviço"
              aria-label="Buscar produto ou serviço"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="catalog-search-listbox"
              aria-activedescendant={results.length > 0 ? `catalog-option-${highlightedIndex}` : undefined}
              className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
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

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setQuickDialog("product")}>
            <Plus className="size-3.5" aria-hidden="true" />
            Novo produto
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setQuickDialog("service")}>
            <Plus className="size-3.5" aria-hidden="true" />
            Novo serviço
          </Button>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível buscar o catálogo agora.
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Buscando...</p>
        ) : results.length > 0 ? (
          <ul id="catalog-search-listbox" role="listbox" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {results.map((item, index) => (
              <li
                key={item.id}
                id={`catalog-option-${index}`}
                role="option"
                aria-selected={index === highlightedIndex}
                className={`flex items-center justify-between gap-3 p-3.5 ${index === highlightedIndex ? "bg-muted/50" : ""}`}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
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
                <Button type="button" size="sm" variant="outline" onClick={() => addCatalogItem(item)}>
                  Adicionar
                </Button>
              </li>
            ))}
          </ul>
        ) : trimmedSearch.length >= MIN_SEARCH_LENGTH ? (
          <p className="text-sm text-muted-foreground">Nenhum item encontrado para &quot;{trimmedSearch}&quot;.</p>
        ) : trimmedSearch.length > 0 ? (
          <p className="text-sm text-muted-foreground">Digite pelo menos 3 caracteres para buscar.</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Itens adicionados</h2>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Nenhum item adicionado ainda. Você pode continuar sem produtos ou serviços.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const lineTotal = draftLineTotal(item);
              const valid = lineIsValid(item);
              return (
                <div key={item.clientId} className="space-y-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {CATALOG_ITEM_TYPE_LABELS[item.type]}
                      </span>
                      {item.code ? <span className="shrink-0 text-xs text-muted-foreground">{item.code}</span> : null}
                      <button
                        type="button"
                        onClick={() => onRemove(item.clientId)}
                        className="ml-1 shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2 className="mr-1 inline size-3 align-[-1px]" aria-hidden="true" />
                        Remover
                      </button>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[11px] text-muted-foreground">Total</p>
                      <p className="text-base font-semibold text-foreground">{decimalStringToBrlDisplay(lineTotal) ?? "—"}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <label htmlFor={`qty-${item.clientId}`} className="text-sm font-medium text-foreground">
                        Quantidade
                      </label>
                      <input
                        id={`qty-${item.clientId}`}
                        type="text"
                        inputMode="decimal"
                        value={item.quantityInput}
                        onChange={(event) => onUpdate(item.clientId, { quantityInput: event.target.value })}
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <MoneyField
                      id={`price-${item.clientId}`}
                      label="Preço unitário"
                      value={item.unitPriceInput}
                      onChange={(next) => onUpdate(item.clientId, { unitPriceInput: next })}
                    />
                    <MoneyField
                      id={`discount-${item.clientId}`}
                      label="Desconto"
                      value={item.lineDiscountInput}
                      onChange={(next) => onUpdate(item.clientId, { lineDiscountInput: next })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor={`notes-${item.clientId}`} className="text-sm font-medium text-foreground">
                      Observação
                    </label>
                    <input
                      id={`notes-${item.clientId}`}
                      type="text"
                      value={item.notes}
                      onChange={(event) => onUpdate(item.clientId, { notes: event.target.value })}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  {!valid ? (
                    <p role="alert" className="text-xs text-destructive">
                      Informe uma quantidade e um preço unitário válidos.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <QuickCatalogDialog
        open={quickDialog !== null}
        onOpenChange={(open) => !open && setQuickDialog(null)}
        presetType={quickDialog ?? "service"}
        onCreated={handleQuickCreated}
      />
    </div>
  );
}

/** Exported for the wizard's "advance" guard: true only when every draft
 * item currently has a valid quantity + unit price. */
export function allItemsValid(items: DraftItem[]): boolean {
  return items.every(lineIsValid);
}
