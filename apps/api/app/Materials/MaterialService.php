<?php

namespace App\Materials;

use App\Models\Material;

/**
 * SUPPLY-API-01A §30/ADR-017 #4-#5. Controller stays thin — every real
 * decision, including the future dependency guards, lives here.
 *
 * `create()`/`update()` need no race-safe unique-constraint translation
 * (§15 — Material.name is deliberately NOT unique) unlike
 * CatalogItem/Customer/Supplier, so this class is simpler than those
 * siblings today.
 *
 * `delete()`/the unit-change guard inside update() are the ONE seam every
 * later gate (SUPPLY-API-01B: MaterialRequirement, 01C: PurchaseOrderItem,
 * 01E: MaterialConsumption/StockAdjustment) must extend — never a second,
 * parallel guard added elsewhere. In this gate, none of those four
 * dependent tables exist, so both checks are structurally present but
 * currently always pass (`hasDependents()` always returns false).
 */
class MaterialService
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    public function create(array $attributes): Material
    {
        return Material::create($attributes);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function update(Material $material, array $attributes): Material
    {
        $material->fill($attributes);
        $material->save();

        return $material;
    }

    public function delete(Material $material): void
    {
        $material->delete();
    }

    /**
     * ADR-017 #4/#5: true once ANY of material_requirements/
     * purchase_order_items/material_consumptions/stock_adjustments has a
     * row for this Material — the single check both the unit-immutability
     * rule and the delete guard will share once those tables exist.
     * Always false in this gate; each later gate that creates one of
     * those tables extends this method's body, never adds a sibling.
     */
    public function hasDependents(Material $material): bool
    {
        return false;
    }
}
