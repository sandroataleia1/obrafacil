"use client";

import { MoneyField } from "@/components/shared/money-field";
import { CATEGORY_SUGGESTIONS, UNIT_SUGGESTIONS } from "./labels";
import type { CatalogItemType } from "./types";

export interface CatalogItemFieldsValue {
  type: CatalogItemType;
  code: string;
  name: string;
  category: string;
  unit: string;
  description: string;
  /** Raw BRL display strings as typed — normalized to a decimal string only at submit time (§24). */
  costPriceInput: string;
  salePriceInput: string;
}

export const EMPTY_CATALOG_ITEM_FIELDS: CatalogItemFieldsValue = {
  // §27: service is the default — ObraFácil's primary focus is executing
  // work/services, not selling physical goods.
  type: "service",
  code: "",
  name: "",
  category: "",
  unit: "",
  description: "",
  costPriceInput: "",
  salePriceInput: "",
};

/** Shared field set for both the create and edit forms (§43). */
export function CatalogItemFields({
  value,
  onChange,
  idPrefix,
  nameError,
  unitError,
  codeError,
  costPriceError,
  salePriceError,
}: {
  value: CatalogItemFieldsValue;
  onChange: (patch: Partial<CatalogItemFieldsValue>) => void;
  idPrefix: string;
  nameError?: string | null;
  unitError?: string | null;
  codeError?: string | null;
  costPriceError?: string | null;
  salePriceError?: string | null;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <span className="text-sm font-medium text-foreground">Tipo</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({ type: "product" })}
            aria-pressed={value.type === "product"}
            className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
              value.type === "product" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground"
            }`}
          >
            Produto
          </button>
          <button
            type="button"
            onClick={() => onChange({ type: "service" })}
            aria-pressed={value.type === "service"}
            className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
              value.type === "service" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground"
            }`}
          >
            Serviço
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Dados do item</h2>

        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium text-foreground">
            Nome
          </label>
          <input
            id={`${idPrefix}-name`}
            type="text"
            value={value.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Pintura de paredes"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {nameError ? (
            <p role="alert" className="text-xs text-destructive">
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-code`} className="text-sm font-medium text-foreground">
            Código <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id={`${idPrefix}-code`}
            type="text"
            value={value.code}
            onChange={(event) => onChange({ code: event.target.value })}
            placeholder="PINT-M2"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {codeError ? (
            <p role="alert" className="text-xs text-destructive">
              {codeError}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-category`} className="text-sm font-medium text-foreground">
            Categoria <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id={`${idPrefix}-category`}
            type="text"
            list={`${idPrefix}-category-suggestions`}
            value={value.category}
            onChange={(event) => onChange({ category: event.target.value })}
            placeholder="Pintura"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          <datalist id={`${idPrefix}-category-suggestions`}>
            {CATEGORY_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-unit`} className="text-sm font-medium text-foreground">
            Unidade
          </label>
          <input
            id={`${idPrefix}-unit`}
            type="text"
            list={`${idPrefix}-unit-suggestions`}
            value={value.unit}
            onChange={(event) => onChange({ unit: event.target.value })}
            placeholder="m²"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          <datalist id={`${idPrefix}-unit-suggestions`}>
            {UNIT_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
          {unitError ? (
            <p role="alert" className="text-xs text-destructive">
              {unitError}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-description`} className="text-sm font-medium text-foreground">
            Descrição <span className="text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            id={`${idPrefix}-description`}
            value={value.description}
            onChange={(event) => onChange({ description: event.target.value })}
            rows={2}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Preços</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <MoneyField
              id={`${idPrefix}-cost-price`}
              label="Custo base"
              value={value.costPriceInput}
              onChange={(next) => onChange({ costPriceInput: next })}
            />
            <p className="text-xs text-muted-foreground">Referência interna de custo.</p>
            {costPriceError ? (
              <p role="alert" className="text-xs text-destructive">
                {costPriceError}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <MoneyField
              id={`${idPrefix}-sale-price`}
              label="Preço de venda"
              value={value.salePriceInput}
              onChange={(next) => onChange({ salePriceInput: next })}
            />
            <p className="text-xs text-muted-foreground">Preço sugerido para novos orçamentos e ordens de serviço.</p>
            {salePriceError ? (
              <p role="alert" className="text-xs text-destructive">
                {salePriceError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
