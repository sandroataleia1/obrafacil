"use client";

import { useEffect, useRef, useState } from "react";
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
}: {
  items: DraftItem[];
  onAdd: (item: DraftItem) => void;
  onUpdate: (clientId: string, patch: Partial<DraftItem>) => void;
  onRemove: (clientId: string) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [quickDialog, setQuickDialog] = useState<CatalogItemType | null>(null);

  const searchSequence = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (search === "") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setError(false);
      return;
    }
    const requestId = ++searchSequence.current;
    setLoading(true);
    setError(false);
    listCatalogItems({ search, active: true, type: typeFilter || undefined, page: 1, perPage: 15 })
      .then((response) => {
        if (searchSequence.current !== requestId) return;
        setResults(response.data);
      })
      .catch(() => {
        if (searchSequence.current !== requestId) return;
        setError(true);
      })
      .finally(() => {
        if (searchSequence.current !== requestId) return;
        setLoading(false);
      });
  }, [search, typeFilter]);

  function addCatalogItem(item: CatalogItem) {
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
  }

  function handleQuickCreated(item: CatalogItem) {
    addCatalogItem(item);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && results.length > 0) addCatalogItem(results[0]!);
              }}
              placeholder="Buscar produto ou serviço"
              aria-label="Buscar produto ou serviço"
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
                <Button type="button" size="sm" variant="outline" onClick={() => addCatalogItem(item)}>
                  Adicionar
                </Button>
              </li>
            ))}
          </ul>
        ) : search !== "" ? (
          <p className="text-sm text-muted-foreground">Nenhum item encontrado para &quot;{search}&quot;.</p>
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
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[item.code, item.unit, CATALOG_ITEM_TYPE_LABELS[item.type]].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(item.clientId)}
                      aria-label={`Remover ${item.name}`}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
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
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <MoneyField
                      id={`discount-${item.clientId}`}
                      label="Desconto"
                      value={item.lineDiscountInput}
                      onChange={(next) => onUpdate(item.clientId, { lineDiscountInput: next })}
                    />
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
                  </div>

                  {!valid ? (
                    <p role="alert" className="text-xs text-destructive">
                      Informe uma quantidade e um preço unitário válidos.
                    </p>
                  ) : (
                    <p className="text-right text-sm font-medium text-foreground">
                      Total da linha: {decimalStringToBrlDisplay(lineTotal)}
                    </p>
                  )}
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
