<?php

namespace App\Budgets;

use App\Budgets\Exceptions\BudgetStatusConflictException;
use App\Enums\BudgetItemSourceType;
use App\Models\Budget;
use App\Models\BudgetItem;
use App\Models\CatalogItem;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * BUDGET-API-01. All BudgetItem mutation lives here — controllers stay
 * thin. Every method recalculates and persists the parent Budget's
 * subtotal/cost_subtotal/margin_amount/margin_percentage/total in the
 * same call, so the header is never left stale after an item
 * add/update/delete.
 *
 * Every public method wraps its ENTIRE body — lock, editability check,
 * resolution, calculation, write, recalculation — in one
 * `DB::transaction()`. The parent Budget is locked
 * (`BudgetLocker::lock()`, a real `SELECT ... FOR UPDATE`) as the very
 * first statement, before `assertMutable()` or anything else reads its
 * status — mirrors ServiceOrderItemService exactly. Lock order is always
 * parent first, matching BudgetService's own locking order, so two
 * mutations on the same Budget can only ever serialize, never deadlock.
 */
class BudgetItemService
{
    public function __construct(private readonly BudgetLocker $locker) {}

    /**
     * @param  array<string, mixed>  $input
     */
    public function addItem(Budget|string $budget, array $input): BudgetItem
    {
        return DB::transaction(function () use ($budget, $input) {
            $lockedBudget = $this->locker->lock($budget);
            $this->assertMutable($lockedBudget);

            $item = $this->buildItem($lockedBudget, $input);

            $this->recalculateTotals($lockedBudget);

            return $item;
        });
    }

    /**
     * Same as addItem() but the caller already holds the parent lock
     * (used by BudgetService::create() while building the initial item
     * set inside its own transaction) — never re-locks, never
     * recalculates on every single item (the caller recalculates once
     * after the full set is built).
     *
     * @param  array<string, mixed>  $input
     */
    public function addItemWithoutLocking(Budget $lockedBudget, array $input): BudgetItem
    {
        return $this->buildItem($lockedBudget, $input);
    }

    /**
     * @param  array<string, mixed>  $input
     */
    public function updateItem(Budget|string $budget, BudgetItem|string $item, array $input): BudgetItem
    {
        return DB::transaction(function () use ($budget, $item, $input) {
            $lockedBudget = $this->locker->lock($budget);
            $this->assertMutable($lockedBudget);

            $itemId = $item instanceof BudgetItem ? $item->id : $item;
            $lockedItem = $lockedBudget->items()->whereKey($itemId)->firstOrFail();

            $quantity = array_key_exists('quantity', $input)
                ? Money::normalize((string) $input['quantity'], 3)
                : (string) $lockedItem->quantity;
            $unitPrice = array_key_exists('unit_price', $input) && $input['unit_price'] !== null
                ? Money::normalize((string) $input['unit_price'])
                : (string) $lockedItem->unit_price;
            $unitCost = array_key_exists('unit_cost', $input)
                ? ($input['unit_cost'] !== null ? Money::normalize((string) $input['unit_cost']) : null)
                : ($lockedItem->unit_cost !== null ? (string) $lockedItem->unit_cost : null);
            $lineDiscount = array_key_exists('line_discount', $input) && $input['line_discount'] !== null
                ? Money::normalize((string) $input['line_discount'])
                : (string) $lockedItem->line_discount;

            $grossSale = BudgetCalculator::grossSale($quantity, $unitPrice);
            $this->assertDiscountWithinGrossSale($lineDiscount, $grossSale);

            $lockedItem->fill([
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'unit_cost' => $unitCost,
                'line_discount' => $lineDiscount,
                'line_total' => Money::subtract($grossSale, $lineDiscount),
                'line_cost_total' => BudgetCalculator::lineCostTotal($quantity, $unitCost),
                'notes' => array_key_exists('notes', $input) ? $input['notes'] : $lockedItem->notes,
                'sort_order' => array_key_exists('sort_order', $input) ? $input['sort_order'] : $lockedItem->sort_order,
            ]);
            $lockedItem->save();

            $this->recalculateTotals($lockedBudget);

            return $lockedItem->fresh();
        });
    }

    public function deleteItem(Budget|string $budget, BudgetItem|string $item): void
    {
        DB::transaction(function () use ($budget, $item) {
            $lockedBudget = $this->locker->lock($budget);
            $this->assertMutable($lockedBudget);

            $itemId = $item instanceof BudgetItem ? $item->id : $item;
            $lockedItem = $lockedBudget->items()->whereKey($itemId)->firstOrFail();
            $lockedItem->delete();

            $this->recalculateTotals($lockedBudget);
        });
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function buildItem(Budget $lockedBudget, array $input): BudgetItem
    {
        $sourceType = BudgetItemSourceType::from($input['source_type']);

        $quantity = Money::normalize((string) $input['quantity'], 3);

        [$catalogItemId, $type, $code, $name, $unit, $description, $unitPrice, $unitCost] = match ($sourceType) {
            BudgetItemSourceType::Catalog => $this->resolveFromCatalog($input),
            BudgetItemSourceType::Calculator, BudgetItemSourceType::Manual => $this->resolveManualLike($input),
        };

        $lineDiscount = Money::normalize((string) ($input['line_discount'] ?? '0.00'));
        $grossSale = BudgetCalculator::grossSale($quantity, $unitPrice);
        $this->assertDiscountWithinGrossSale($lineDiscount, $grossSale);

        $nextSortOrder = ((int) $lockedBudget->items()->max('sort_order')) + 1;

        return BudgetItem::create([
            'budget_id' => $lockedBudget->id,
            'catalog_item_id' => $catalogItemId,
            'source_type' => $sourceType->value,
            'type' => $type,
            'calculator_type' => $sourceType === BudgetItemSourceType::Calculator
                ? $input['calculator_type']
                : null,
            'code' => $code,
            'name' => $name,
            'unit' => $unit,
            'description' => $description,
            'quantity' => $quantity,
            'unit_price' => $unitPrice,
            'unit_cost' => $unitCost,
            'line_discount' => $lineDiscount,
            'line_total' => Money::subtract($grossSale, $lineDiscount),
            'line_cost_total' => BudgetCalculator::lineCostTotal($quantity, $unitCost),
            'calculation_snapshot' => $sourceType === BudgetItemSourceType::Calculator
                ? ($input['calculation_snapshot'] ?? null)
                : null,
            'notes' => $input['notes'] ?? null,
            'sort_order' => $nextSortOrder,
        ]);
    }

    /**
     * Mirrors ServiceOrderItemService::assertDiscountWithinGross()
     * exactly — spec §61 doesn't list an explicit per-line CHECK
     * constraint capping line_discount at gross_sale, but the total must
     * never go negative (line_total is CHECK'd >= 0), so a discount
     * larger than the line's own gross_sale is rejected here as a 422,
     * same discipline as the ServiceOrder domain, rather than silently
     * clamping to zero.
     */
    private function assertDiscountWithinGrossSale(string $lineDiscount, string $grossSale): void
    {
        if (Money::compare($lineDiscount, $grossSale) > 0) {
            throw ValidationException::withMessages([
                'line_discount' => 'O desconto não pode ser maior que o valor da linha.',
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array{0: string, 1: ?string, 2: ?string, 3: string, 4: string, 5: ?string, 6: string, 7: ?string}
     */
    private function resolveFromCatalog(array $input): array
    {
        $catalogItem = CatalogItem::query()->find($input['catalog_item_id'] ?? null);
        if ($catalogItem === null) {
            throw ValidationException::withMessages(['catalog_item_id' => 'Item de catálogo inválido.']);
        }
        if (! $catalogItem->active) {
            throw ValidationException::withMessages(['catalog_item_id' => 'Este item do catálogo está inativo.']);
        }

        $unitPrice = array_key_exists('unit_price', $input) && $input['unit_price'] !== null
            ? Money::normalize((string) $input['unit_price'])
            : ($catalogItem->sale_price !== null ? Money::normalize((string) $catalogItem->sale_price) : null);
        if ($unitPrice === null) {
            throw ValidationException::withMessages(['unit_price' => 'Informe o preço unitário.']);
        }

        // §20: unlike unit_price (which the browser may negotiate/override),
        // unit_cost for a catalog-sourced item is NEVER settable by the
        // client — it always mirrors CatalogItem.cost_price server-side,
        // even when the request tried to send one (already rejected at the
        // FormRequest layer via `prohibited_if:source_type,catalog`, this
        // is belt-and-suspenders against any caller that bypasses it).
        $unitCost = $catalogItem->cost_price !== null ? Money::normalize((string) $catalogItem->cost_price) : null;

        return [
            $catalogItem->id,
            $catalogItem->type->value,
            $catalogItem->code,
            $catalogItem->name,
            $catalogItem->unit,
            $catalogItem->description,
            $unitPrice,
            $unitCost,
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array{0: null, 1: null, 2: ?string, 3: string, 4: string, 5: ?string, 6: string, 7: ?string}
     */
    private function resolveManualLike(array $input): array
    {
        $unitPrice = Money::normalize((string) $input['unit_price']);
        $unitCost = array_key_exists('unit_cost', $input) && $input['unit_cost'] !== null
            ? Money::normalize((string) $input['unit_cost'])
            : null;

        return [
            null,
            null,
            $input['code'] ?? null,
            $input['name'],
            $input['unit'],
            $input['description'] ?? null,
            $unitPrice,
            $unitCost,
        ];
    }

    /**
     * Recomputes and persists the parent Budget's totals from its
     * *current* set of items — called only after the parent is locked,
     * so this always sums the truly-current committed-or-in-this-
     * transaction items, never a stale snapshot from before the lock.
     */
    public function recalculateTotals(Budget $budget): void
    {
        $items = $budget->items()->get(['line_total', 'line_cost_total']);

        $subtotal = BudgetCalculator::subtotal($items->map(fn ($item) => (string) $item->line_total));
        $costSubtotal = BudgetCalculator::costSubtotal(
            $items->map(fn ($item) => $item->line_cost_total !== null ? (string) $item->line_cost_total : null)
        );
        $marginAmount = BudgetCalculator::marginAmount($subtotal, $costSubtotal);
        $marginPercentage = BudgetCalculator::marginPercentage($marginAmount, $costSubtotal);

        if (Money::compare((string) $budget->discount_amount, $subtotal) > 0) {
            throw ValidationException::withMessages([
                'discount_amount' => 'O desconto não pode ser maior que o novo subtotal.',
            ]);
        }

        $budget->subtotal = $subtotal;
        $budget->cost_subtotal = $costSubtotal;
        $budget->margin_amount = $marginAmount;
        $budget->margin_percentage = $marginPercentage;
        $budget->total = BudgetCalculator::total($subtotal, (string) $budget->discount_amount);
        $budget->save();
    }

    private function assertMutable(Budget $budget): void
    {
        if (! $budget->status->isMutable()) {
            throw new BudgetStatusConflictException('Este orçamento não está mais em rascunho e não pode ser editado.');
        }
    }
}
