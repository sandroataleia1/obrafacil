<?php

namespace App\Stock;

use App\Models\GoodsReceiptItem;
use App\Models\MaterialConsumption;
use App\Models\StockAdjustment;
use App\Purchases\Quantity;
use Illuminate\Support\Collection;

/**
 * SUPPLY-API-01E §2-4/§49-58. The SINGLE source of truth for the physical
 * stock ledger of one Project + Material pair — never duplicated in
 * MaterialConsumptionService/StockAdjustmentService/GoodsReceiptService/
 * Resources. There is no persisted balance anywhere (§2): every read here
 * re-derives from GoodsReceiptItem/MaterialConsumption/StockAdjustment.
 *
 * §4: events are aggregated PER DAY before the cumulative check — a
 * same-day arrival can supply a same-day departure. §5: everything is
 * decimal-string (via App\Purchases\Quantity, scale 3, bcmath) — never
 * float, never integer cents.
 *
 * Each event is `['date' => 'Y-m-d', 'quantity' => signed decimal string]`
 * — positive for GoodsReceiptItem/ADJUSTMENT_IN, negative for
 * MaterialConsumption/ADJUSTMENT_OUT.
 */
class StockLedgerService
{
    /**
     * @return Collection<int, array{date: string, quantity: string}>
     */
    public function events(string $projectId, string $materialId, ?string $excludeGoodsReceiptId = null): Collection
    {
        $events = collect();

        $receiptQuery = GoodsReceiptItem::query()
            ->join('purchase_order_items', 'purchase_order_items.id', '=', 'goods_receipt_items.purchase_order_item_id')
            ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
            ->join('goods_receipts', 'goods_receipts.id', '=', 'goods_receipt_items.goods_receipt_id')
            ->where('purchase_orders.project_id', $projectId)
            ->where('purchase_order_items.material_id', $materialId);

        if ($excludeGoodsReceiptId !== null) {
            $receiptQuery->where('goods_receipt_items.goods_receipt_id', '!=', $excludeGoodsReceiptId);
        }

        foreach ($receiptQuery->select('goods_receipts.received_at as date', 'goods_receipt_items.quantity as quantity')->get() as $row) {
            $events->push(['date' => $this->dateString($row->date), 'quantity' => Quantity::normalize((string) $row->quantity)]);
        }

        $consumptions = MaterialConsumption::query()
            ->where('project_id', $projectId)
            ->where('material_id', $materialId)
            ->get(['consumed_at', 'quantity']);

        foreach ($consumptions as $consumption) {
            $events->push([
                'date' => $this->dateString($consumption->consumed_at),
                'quantity' => Quantity::subtract('0.000', Quantity::normalize((string) $consumption->quantity)),
            ]);
        }

        $adjustments = StockAdjustment::query()
            ->where('project_id', $projectId)
            ->where('material_id', $materialId)
            ->get(['type', 'occurred_at', 'quantity']);

        foreach ($adjustments as $adjustment) {
            $magnitude = Quantity::normalize((string) $adjustment->quantity);
            $signed = $adjustment->type->value === 'ADJUSTMENT_IN' ? $magnitude : Quantity::subtract('0.000', $magnitude);

            $events->push(['date' => $this->dateString($adjustment->occurred_at), 'quantity' => $signed]);
        }

        return $events;
    }

    /**
     * §4: true iff, for every date D in the timeline, the cumulative
     * balance up to and including D is >= 0. Same-day events are summed
     * together first.
     *
     * @param  Collection<int, array{date: string, quantity: string}>  $events
     */
    public function isValid(Collection $events): bool
    {
        $byDate = [];
        foreach ($events as $event) {
            $byDate[$event['date']] = Quantity::add($byDate[$event['date']] ?? '0.000', $event['quantity']);
        }

        ksort($byDate);

        $cumulative = '0.000';
        foreach ($byDate as $dayTotal) {
            $cumulative = Quantity::add($cumulative, $dayTotal);

            if (Quantity::compare($cumulative, '0.000') < 0) {
                return false;
            }
        }

        return true;
    }

    /**
     * §11/§23: true iff adding this ONE candidate event to the current
     * persisted timeline keeps every date's cumulative balance >= 0.
     */
    public function isValidWithCandidate(string $projectId, string $materialId, string $date, string $signedQuantity, ?string $excludeGoodsReceiptId = null): bool
    {
        $events = $this->events($projectId, $materialId, $excludeGoodsReceiptId);
        $events->push(['date' => $date, 'quantity' => $signedQuantity]);

        return $this->isValid($events);
    }

    /**
     * §31-32: true iff the timeline stays valid with every GoodsReceiptItem
     * belonging to `$excludeGoodsReceiptId` removed entirely (no candidate
     * added — this simulates the Receipt's deletion, not a new event).
     */
    public function isValidExcludingReceipt(string $projectId, string $materialId, string $excludeGoodsReceiptId): bool
    {
        return $this->isValid($this->events($projectId, $materialId, $excludeGoodsReceiptId));
    }

    /**
     * §49: total_in/total_out/balance, all decimal strings scale 3.
     *
     * @param  Collection<int, array{date: string, quantity: string}>  $events
     * @return array{total_in: string, total_out: string, balance: string}
     */
    public function totals(Collection $events): array
    {
        $totalIn = '0.000';
        $totalOut = '0.000';

        foreach ($events as $event) {
            if (Quantity::compare($event['quantity'], '0.000') >= 0) {
                $totalIn = Quantity::add($totalIn, $event['quantity']);
            } else {
                $totalOut = Quantity::add($totalOut, Quantity::subtract('0.000', $event['quantity']));
            }
        }

        return [
            'total_in' => $totalIn,
            'total_out' => $totalOut,
            'balance' => Quantity::subtract($totalIn, $totalOut),
        ];
    }

    private function dateString(mixed $value): string
    {
        return $value instanceof \DateTimeInterface ? $value->format('Y-m-d') : (string) $value;
    }
}
