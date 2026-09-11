<?php

namespace App\ServiceOrders;

use App\Models\CatalogItem;
use App\Models\ServiceOrder;
use App\Models\ServiceOrderItem;
use App\ServiceOrders\Exceptions\ServiceOrderStatusConflictException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * BACKEND-06 §19-26/§43-46. All ServiceOrderItem mutation lives here —
 * controllers stay thin. Every method recalculates and persists the
 * parent ServiceOrder's subtotal/total in the same call (§15/§16/§17 of
 * the item-total spec block), so the header is never left stale after an
 * item add/update/delete.
 */
class ServiceOrderItemService
{
    /**
     * @param  array<string, mixed>  $input
     */
    public function addItem(ServiceOrder $order, array $input): ServiceOrderItem
    {
        $this->assertEditable($order);

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

        // §15/§45: item insert + header recalculation happen atomically —
        // a nested DB::transaction() becomes a real Postgres SAVEPOINT
        // inside the caller's own transaction (or RefreshDatabase's, in
        // tests), so a later ValidationException here rolls back the
        // insert too, never leaving an orphaned item behind.
        return DB::transaction(function () use ($order, $catalogItem, $quantity, $unitPrice, $lineDiscount, $gross, $input) {
            $nextSortOrder = ((int) $order->items()->max('sort_order')) + 1;

            $item = ServiceOrderItem::create([
                'service_order_id' => $order->id,
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

            $this->recalculateTotals($order);

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
    public function updateItem(ServiceOrder $order, ServiceOrderItem $item, array $input): ServiceOrderItem
    {
        $this->assertEditable($order);

        $quantity = array_key_exists('quantity', $input)
            ? Money::normalize((string) $input['quantity'], 3)
            : (string) $item->quantity;
        $unitPrice = array_key_exists('unit_price', $input) && $input['unit_price'] !== null
            ? Money::normalize((string) $input['unit_price'])
            : (string) $item->unit_price;
        $lineDiscount = array_key_exists('line_discount', $input) && $input['line_discount'] !== null
            ? Money::normalize((string) $input['line_discount'])
            : (string) $item->line_discount;

        $gross = ServiceOrderCalculator::grossLine($quantity, $unitPrice);
        $this->assertDiscountWithinGross($lineDiscount, $gross);

        return DB::transaction(function () use ($order, $item, $quantity, $unitPrice, $lineDiscount, $gross, $input) {
            $item->fill([
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'line_discount' => $lineDiscount,
                'line_total' => Money::subtract($gross, $lineDiscount),
                'notes' => array_key_exists('notes', $input) ? $input['notes'] : $item->notes,
                'sort_order' => array_key_exists('sort_order', $input) ? $input['sort_order'] : $item->sort_order,
            ]);
            $item->save();

            $this->recalculateTotals($order);

            return $item->fresh();
        });
    }

    public function deleteItem(ServiceOrder $order, ServiceOrderItem $item): void
    {
        $this->assertEditable($order);

        DB::transaction(function () use ($order, $item) {
            $item->delete();

            $this->recalculateTotals($order);
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
     * §45/§46: recomputes subtotal from the current items, then re-checks
     * order_discount against the *new* subtotal — an item removal/edit
     * that would leave order_discount > subtotal is rejected wholesale
     * (§45: "Não ajustar desconto silenciosamente"), rolling back the
     * item mutation itself since this runs inside the same request; the
     * caller (controller) is expected to run this within a transaction
     * for multi-statement atomicity when needed.
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
