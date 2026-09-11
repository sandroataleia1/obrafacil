import type { CatalogItemType } from "./types";

export const CATALOG_ITEM_TYPE_LABELS: Record<CatalogItemType, string> = {
  product: "Produto",
  service: "Serviço",
};

export const CATALOG_ITEM_TYPE_OPTIONS: { value: CatalogItemType; label: string }[] = [
  { value: "product", label: "Produto" },
  { value: "service", label: "Serviço" },
];

/** §31: suggestions only — the API accepts any free-text category. */
export const CATEGORY_SUGGESTIONS = ["Pintura", "Elétrica", "Hidráulica", "Alvenaria", "Acabamento", "Consultoria"];

/** §32: suggestions only — the API accepts any free-text unit. */
export const UNIT_SUGGESTIONS = ["un", "m", "m²", "m³", "kg", "h", "dia", "diária", "serviço", "ponto"];
