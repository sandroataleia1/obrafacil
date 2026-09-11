<?php

namespace App\ServiceOrders;

use App\Models\CatalogItem;
use App\Models\ServiceOrder;
use App\Models\ServiceOrderItem;
use App\ServiceOrders\Exceptions\ServiceOrderStatusConflictException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * BACKEND-06 §19-26/§43-46. BACKEND-06B §9-11/§26. All ServiceOrderItem
 * mutation lives here — controllers stay thin. Every method recalculates
 * and persists the parent ServiceOrder's subtotal/total in the same call,
 * so the header is never left stale after an item add/update/delete.
 *
 * Every public method here wraps its ENTIRE body — lock, editability
 * check, resolution, calculation, write, recalculation — in one
 * `DB::transaction()`. The parent ServiceOrder is locked
 * (`ServiceOrderLocker::lock()`, a real `SELECT ... FOR UPDATE`) as the
 * very first statement, before `assertEditable()` or anything else reads
 * its status: a caller may pass an `$order`/`$item` instance loaded
 * before this call, possibly stale by the time this transaction actually
 * runs, so only the locked/re-resolved instances inside the closure are
 * ever trusted (BACKEND-06B §3/§9/§10/§21). Lock order is always parent
 * first (never a child row locked ahead of it), matching
 * ServiceOrderService's own locking order, so two mutations on the same
 * O.S. can only ever serialize, never deadlock against each other
 * (§26/§27).
 */
class ServiceOrderItemService
{
    public function __construct(private readonly ServiceOrderLocker $locker) {}

    /**
     * @param  array<string, mixed>  $input
     */
    public function addItem(ServiceOrder|string $order, array $input): ServiceOrderItem
    {
        return DB::transaction(function () use ($order, $input) {
            $lockedOrder = $this->locker->lock($order);
            $this->assertEditable($lockedOrder);

            $catalogItem = CatalogItem::query()->find($input['catalog_item_id']);
            if ($catalogItem === null) {
                throw ValidationException::withMessages(['catalog_item_id' => 'Item de catálogo inválido.']);
            }
            if (! $catalogItem->active) {
                throw ValidationException::withMessages(['catalog_item_id' => 'Este item do catálogo está inativo.']);
            }

            $quantity = Money::normalize((string) $input['quantity'], 3);
            $unitPrice = $this->resolveUnitPrice($input, $catalogItem);
            $lineDiscount = Money::normalize((string) ($input['line_discount'] ?? '0.00'));

            $gross = ServiceOrderCalculator::grossLine($quantity, $unitPrice);
            $this->assertDiscountWithinGross($lineDiscount, $gross);

            // §18: protected by the parent lock — no concurrent addItem()
            // for this same O.S. can compute this MAX() until the other
            // one commits/rolls back, so two concurrent inserts always
            // land on distinct sort_order values.
            $nextSortOrder = ((int) $lockedOrder->items()->max('sort_order')) + 1;

            $item = ServiceOrderItem::create([
                'service_order_id' => $lockedOrder->id,
                'catalog_item_id' => $catalogItem->id,
                'type' => $catalogItem->type->value,
                'code' => $catalogItem->code,
                'name' => $catalogItem->name,
                'unit' => $catalogItem->unit,
                'description' => $catalogItem->description,
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'line_discount' => $lineDiscount,
                'line_total' => Money::subtract($gross, $lineDiscount),
                'notes' => $input['notes'] ?? null,
                'sort_order' => $nextSortOrder,
            ]);

            $this->recalculateTotals($lockedOrder);

            return $item;
        });
    }

    /**
     * §44: only quantity/unit_price/line_discount/notes/sort_order can be
     * changed here — catalog_item_id/type/code/name/unit/description are
     * the snapshot from insertion time and never touched by this method.
     *
     * @param  array<string, mixed>  $input
     */
    public function updateItem(ServiceOrder|string $order, ServiceOrderItem|string $item, array $input): ServiceOrderItem
    {
        return DB::transaction(function () use ($order, $item, $input) {
            $lockedOrder = $this->locker->lock($order);
            $this->assertEditable($lockedOrder);

            // §10: never trust a possibly-stale ServiceOrderItem instance
            // the caller loaded before this transaction — re-resolve it
            // scoped to the now-locked parent, which is also what keeps a
            // cross-order item id a 404 (ModelNotFoundException) instead
            // of mutating another O.S.'s line.
            $itemId = $item instanceof ServiceOrderItem ? $item->id : $item;
            $lockedItem = $lockedOrder->items()->whereKey($itemId)->firstOrFail();

            $quantity = array_key_exists('quantity', $input)
                ? Money::normalize((string) $input['quantity'], 3)
                : (string) $lockedItem->quantity;
            $unitPrice = array_key_exists('unit_price', $input) && $input['unit_price'] !== null
                ? Money::normalize((string) $input['unit_price'])
                : (string) $lockedItem->unit_price;
            $lineDiscount = array_key_exists('line_discount', $input) && $input['line_discount'] !== null
                ? Money::normalize((string) $input['line_discount'])
                : (string) $lockedItem->line_discount;

            $gross = ServiceOrderCalculator::grossLine($quantity, $unitPrice);
            $this->assertDiscountWithinGross($lineDiscount, $gross);

            $lockedItem->fill([
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'line_discount' => $lineDiscount,
                'line_total' => Money::subtract($gross, $lineDiscount),
                'notes' => array_key_exists('notes', $input) ? $input['notes'] : $lockedItem->notes,
                'sort_order' => array_key_exists('sort_order', $input) ? $input['sort_order'] : $lockedItem->sort_order,
            ]);
            $lockedItem->save();

            $this->recalculateTotals($lockedOrder);

            return $lockedItem->fresh();
        });
    }

    public function deleteItem(ServiceOrder|string $order, ServiceOrderItem|string $item): void
    {
        DB::transaction(function () use ($order, $item) {
            $lockedOrder = $this->locker->lock($order);
            $this->assertEditable($lockedOrder);

            $itemId = $item instanceof ServiceOrderItem ? $item->id : $item;
            $lockedItem = $lockedOrder->items()->whereKey($itemId)->firstOrFail();
            $lockedItem->delete();

            // §11/§45: recalculateTotals() re-validates order_discount
            // against the post-delete subtotal and throws if it no longer
            // fits — the ValidationException propagates out of this
            // transaction closure, rolling back the delete too, so the
            // whole operation is rejected wholesale, never leaving the
            // item gone with a now-invalid discount.
            $this->recalculateTotals($lockedOrder);
        });
    }

    /**
     * §22: `unit_price` explicitly sent (including "0.00") always wins.
     * Omitted or `null` falls back to the CatalogItem's current
     * `sale_price` — if that is also `null`, there is no usable price at
     * all.
     *
     * @param  array<string, mixed>  $input
     */
    private function resolveUnitPrice(array $input, CatalogItem $catalogItem): string
    {
        if (array_key_exists('unit_price', $input) && $input['unit_price'] !== null) {
            return Money::normalize((string) $input['unit_price']);
        }

        if ($catalogItem->sale_price !== null) {
            return Money::normalize((string) $catalogItem->sale_price);
        }

        throw ValidationException::withMessages(['unit_price' => 'Informe o preço unitário.']);
    }

    private function assertDiscountWithinGross(string $lineDiscount, string $gross): void
    {
        if (Money::compare($lineDiscount, $gross) > 0) {
            throw ValidationException::withMessages(['line_discount' => 'O desconto não pode ser maior que o valor da linha.']);
        }
    }

    /**
     * §12/§45/§46: called only after the parent is locked, so this always
     * sums the truly-current set of committed-or-in-this-transaction
     * items — never a stale snapshot from before the lock was acquired.
     * Re-checks order_discount against the *new* subtotal and rejects the
     * whole mutation (§45: "Não ajustar desconto silenciosamente") if it
     * no longer fits.
     */
    private function recalculateTotals(ServiceOrder $order): void
    {
        $lineTotals = $order->items()->pluck('line_total')->map(fn ($value) => (string) $value);
        $subtotal = ServiceOrderCalculator::subtotal($lineTotals);

        if (Money::compare((string) $order->order_discount, $subtotal) > 0) {
            throw ValidationException::withMessages([
                'order_discount' => 'O desconto da O.S. não pode ser maior que o novo subtotal.',
            ]);
        }

        $order->subtotal = $subtotal;
        $order->total = ServiceOrderCalculator::total($subtotal, (string) $order->order_discount, (string) $order->travel_fee);
        $order->save();
    }

    private function assertEditable(ServiceOrder $order): void
    {
        if ($order->status->isTerminal()) {
            throw new ServiceOrderStatusConflictException('Esta O.S. já foi finalizada ou cancelada e não pode mais ser editada.');
        }
    }
}
