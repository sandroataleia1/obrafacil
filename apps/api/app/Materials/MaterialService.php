<?php

namespace App\Materials;

use App\Enums\MaterialUnitCode;
use App\Models\Material;
use App\Models\MaterialConsumption;
use App\Models\MaterialRequirement;
use App\Models\PurchaseOrderItem;
use App\Models\StockAdjustment;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * SUPPLY-API-01A §30/ADR-017 #4-#5. Controller stays thin — every real
 * decision, including the dependency guards, lives here.
 *
 * `create()`/`update()` need no race-safe unique-constraint translation
 * (§15 — Material.name is deliberately NOT unique) unlike
 * CatalogItem/Customer/Supplier, so this class is simpler than those
 * siblings today.
 *
 * SUPPLY-API-01B §20-27: `hasDependents()` is now wired to a real table
 * (`material_requirements`) — the unit-change guard in `update()` and the
 * dependency guard in `delete()` both call it, so both checks live/die
 * together as this method is extended by later gates. SUPPLY-API-01C
 * §39/§41-42 adds the second dependent, `purchase_order_items`.
 *
 * SUPPLY-API-01C §40/§44/DOMAIN-SERVICE-TENANT-DEFENSE-01: `update()`/
 * `delete()` never trust the Model instance the caller already holds —
 * both re-resolve by id under CompanyScope first. `delete()` additionally
 * takes a real row lock (`lockForUpdate()`) around the whole
 * check-then-delete, so a concurrent MaterialRequirement/PurchaseOrderItem
 * INSERT for this same Material serializes against it instead of racing
 * a plain SELECT-then-DELETE.
 *
 * SUPPLY-API-01C1 §1-5: `update()` now takes the SAME `lockForUpdate()`
 * row lock as `delete()`/`MaterialRequirementService::create()`/
 * `PurchaseOrderItemService::addItem()` — the unit-immutability
 * invariant (§1) is only linearizable under concurrency if every writer
 * that reads-then-decides based on `hasDependents()` locks the same row
 * first. Before this gate, `update()` did a plain `findOrFail()` (no
 * lock), so a concurrent dependent INSERT could commit between its check
 * and its save(), letting a unit change succeed against a Material that,
 * by the time the transaction committed, already had a dependent with a
 * stale unit snapshot.
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
        return DB::transaction(function () use ($material, $attributes) {
            $lockedMaterial = Material::query()->lockForUpdate()->findOrFail($material->id);

            $this->assertUnitChangeable($lockedMaterial, $attributes);

            $lockedMaterial->fill($attributes);
            $lockedMaterial->save();

            return $lockedMaterial;
        });
    }

    public function delete(Material $material): void
    {
        DB::transaction(function () use ($material) {
            $lockedMaterial = Material::query()->lockForUpdate()->findOrFail($material->id);

            $this->assertDeletable($lockedMaterial);

            $lockedMaterial->delete();
        });
    }

    /**
     * ADR-017 #4/#5: true once ANY of material_requirements/
     * purchase_order_items/material_consumptions/stock_adjustments has a
     * row for this Material — the single check both the unit-immutability
     * rule and the delete guard share. SUPPLY-API-01D/01E complete this
     * four-way check (§40) — GoodsReceipt is deliberately NOT a fifth
     * check: it stays transitively covered via purchase_order_items
     * (§40/§80), since a GoodsReceiptItem can only exist against a
     * PurchaseOrderItem that already blocks this Material.
     */
    public function hasDependents(Material $material): bool
    {
        return MaterialRequirement::query()->where('material_id', $material->id)->exists()
            || PurchaseOrderItem::query()->where('material_id', $material->id)->exists()
            || MaterialConsumption::query()->where('material_id', $material->id)->exists()
            || StockAdjustment::query()->where('material_id', $material->id)->exists();
    }

    /**
     * §22/§23: a unit change is unit_code changing OR unit_custom_label
     * changing (e.g. other/"rolo" -> other/"bobina" is still a unit
     * change even though unit_code stays "other") — comparing unit_code
     * alone would miss that case.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function assertUnitChangeable(Material $material, array $attributes): void
    {
        $newUnitCode = array_key_exists('unit_code', $attributes)
            ? $this->normalizeUnitCode($attributes['unit_code'])
            : $material->unit_code->value;
        $newCustomLabel = array_key_exists('unit_custom_label', $attributes)
            ? $attributes['unit_custom_label']
            : $material->unit_custom_label;

        $unitChanged = $newUnitCode !== $material->unit_code->value || $newCustomLabel !== $material->unit_custom_label;

        if ($unitChanged && $this->hasDependents($material)) {
            throw ValidationException::withMessages([
                'unit_code' => 'Este material já possui histórico operacional e sua unidade não pode ser alterada.',
            ]);
        }
    }

    private function normalizeUnitCode(mixed $value): string
    {
        return $value instanceof MaterialUnitCode ? $value->value : (string) $value;
    }

    private function assertDeletable(Material $material): void
    {
        if ($this->hasDependents($material)) {
            throw ValidationException::withMessages([
                'material' => 'Este material possui necessidades cadastradas em obras e não pode ser excluído.',
            ]);
        }
    }
}
