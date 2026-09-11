import type { CatalogItem, CatalogItemUpdatePayload } from "./types";

/**
 * §42: `PUT /api/v1/catalog-items/{id}` requires a full snapshot
 * (`type`/`name`/`unit` are mandatory on every PUT) — inactivating or
 * reactivating an item must never send only `{ active: false }`. This
 * builds the complete payload from the currently-loaded item, applying
 * only the given overrides.
 */
export function catalogItemToUpdatePayload(
  item: CatalogItem,
  overrides: Partial<CatalogItemUpdatePayload> = {}
): CatalogItemUpdatePayload {
  return {
    type: item.type,
    code: item.code,
    name: item.name,
    category: item.category,
    unit: item.unit,
    description: item.description,
    cost_price: item.cost_price,
    sale_price: item.sale_price,
    active: item.active,
    ...overrides,
  };
}
