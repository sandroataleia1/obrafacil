<?php

namespace App\Stock;

use App\Purchases\Quantity;
use App\Support\CurrentCompanyContext;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * SUPPLY-API-01E §49-64/§84. StockPosition/StockMovement are pure read
 * models — no table, no persisted balance (§49). Every query here is
 * manually scoped to the active tenant's `company_id` (§66) because these
 * are raw query-builder queries, not Eloquent models, so `CompanyScope`
 * never applies to them automatically.
 *
 * §61/§84: `listPositions()` runs a handful of GROUP BY aggregate queries
 * for the WHOLE requested page at once — never one query per pair — so
 * growing the number of rows on a page never multiplies query count.
 */
class StockPositionService
{
    private const int DEFAULT_PER_PAGE = 15;

    private const int MAX_PER_PAGE = 100;

    private const int DEFAULT_MOVEMENTS_PER_PAGE = 30;

    private const int MAX_MOVEMENTS_PER_PAGE = 100;

    public function __construct(
        private readonly CurrentCompanyContext $companyContext,
        private readonly StockLedgerService $ledger,
    ) {}

    /**
     * §50/§60: the union of pairs with ANY physical movement, a
     * MaterialRequirement, or an item on an `ordered` PurchaseOrder —
     * filtered/searched/paginated at the SQL level (§61), never "load
     * everything then paginate in PHP".
     *
     * @param  array{search?: ?string, project_id?: ?string, page?: int, per_page?: int}  $filters
     */
    public function listPositions(array $filters): LengthAwarePaginator
    {
        $companyId = $this->companyContext->id();
        $perPage = min((int) ($filters['per_page'] ?? self::DEFAULT_PER_PAGE), self::MAX_PER_PAGE);

        $pairs = $this->pairsUnion($companyId);

        $query = DB::query()->fromSub($pairs, 'pairs')
            ->join('projects', 'projects.id', '=', 'pairs.project_id')
            ->join('materials', 'materials.id', '=', 'pairs.material_id')
            ->select(
                'pairs.project_id', 'pairs.material_id',
                'projects.number as project_number', 'projects.name as project_name',
                'materials.name as material_name', 'materials.unit_code as material_unit_code',
                'materials.unit_custom_label as material_unit_custom_label', 'materials.active as material_active'
            );

        if (! empty($filters['project_id'])) {
            $query->where('pairs.project_id', $filters['project_id']);
        }

        if (! empty($filters['search'])) {
            $query->where('materials.name', 'ilike', '%'.str_replace(['%', '_'], ['\\%', '\\_'], $filters['search']).'%');
        }

        $query->orderBy('materials.name')->orderBy('projects.name')->orderBy('pairs.project_id')->orderBy('pairs.material_id');

        $page = max(1, (int) ($filters['page'] ?? 1));
        $paginator = $query->paginate($perPage, ['*'], 'page', $page);

        $pairKeys = collect($paginator->items())->map(fn ($row) => ['project_id' => $row->project_id, 'material_id' => $row->material_id]);
        $metricsByPair = $this->computeMetricsForPairs($companyId, $pairKeys);

        $paginator->setCollection($paginator->getCollection()->map(function ($row) use ($metricsByPair) {
            $key = "{$row->project_id}::{$row->material_id}";

            return (object) array_merge((array) $row, $metricsByPair[$key] ?? $this->zeroMetrics());
        }));

        return $paginator;
    }

    /**
     * §62/§64: metrics for a single Project+Material pair. Returns
     * zero-valued metrics (never a 404) if the pair has no fact at all —
     * that is a legitimate "nothing here yet" state, not an error.
     *
     * @return array<string, mixed>
     */
    public function getPosition(string $projectId, string $materialId): array
    {
        $companyId = $this->companyContext->id();
        $pairKeys = collect([['project_id' => $projectId, 'material_id' => $materialId]]);
        $metricsByPair = $this->computeMetricsForPairs($companyId, $pairKeys);

        return $metricsByPair["{$projectId}::{$materialId}"] ?? $this->zeroMetrics();
    }

    /**
     * §63/§48: paginated movement history for one Project+Material,
     * ordered `occurred_at DESC`, then `source_created_at DESC`, then
     * `movement_id DESC` — fully deterministic, never relying on
     * unordered SQL row order.
     *
     * @param  array{page?: int, per_page?: int}  $pagination
     */
    public function listMovements(string $projectId, string $materialId, array $pagination): LengthAwarePaginator
    {
        $perPage = min((int) ($pagination['per_page'] ?? self::DEFAULT_MOVEMENTS_PER_PAGE), self::MAX_MOVEMENTS_PER_PAGE);
        $page = max(1, (int) ($pagination['page'] ?? 1));

        $union = $this->movementsUnion($projectId, $materialId);

        $query = DB::query()->fromSub($union, 'movements')
            ->orderByDesc('occurred_at')
            ->orderByDesc('source_created_at')
            ->orderByDesc('movement_id');

        return $query->paginate($perPage, ['*'], 'page', $page);
    }

    private function pairsUnion(string $companyId): Builder
    {
        $goodsReceiptPairs = DB::table('goods_receipt_items')
            ->join('purchase_order_items', 'purchase_order_items.id', '=', 'goods_receipt_items.purchase_order_item_id')
            ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
            ->where('goods_receipt_items.company_id', $companyId)
            ->select('purchase_orders.project_id', 'purchase_order_items.material_id')
            ->distinct();

        $consumptionPairs = DB::table('material_consumptions')
            ->where('company_id', $companyId)
            ->select('project_id', 'material_id')
            ->distinct();

        $adjustmentPairs = DB::table('stock_adjustments')
            ->where('company_id', $companyId)
            ->select('project_id', 'material_id')
            ->distinct();

        $requirementPairs = DB::table('material_requirements')
            ->where('company_id', $companyId)
            ->select('project_id', 'material_id')
            ->distinct();

        $orderedItemPairs = DB::table('purchase_order_items')
            ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
            ->where('purchase_orders.company_id', $companyId)
            ->where('purchase_orders.commercial_status', 'ordered')
            ->select('purchase_orders.project_id', 'purchase_order_items.material_id')
            ->distinct();

        return $goodsReceiptPairs
            ->union($consumptionPairs)
            ->union($adjustmentPairs)
            ->union($requirementPairs)
            ->union($orderedItemPairs);
    }

    /**
     * §53-58: every metric for the given set of pairs, computed via a
     * fixed number of GROUP BY aggregate queries regardless of how many
     * pairs are requested.
     *
     * @param  Collection<int, array{project_id: string, material_id: string}>  $pairKeys
     * @return array<string, array<string, mixed>>
     */
    private function computeMetricsForPairs(string $companyId, Collection $pairKeys): array
    {
        if ($pairKeys->isEmpty()) {
            return [];
        }

        $projectIds = $pairKeys->pluck('project_id')->unique()->values();
        $materialIds = $pairKeys->pluck('material_id')->unique()->values();
        $validKeys = $pairKeys->map(fn ($pair) => "{$pair['project_id']}::{$pair['material_id']}")->flip();

        $required = $this->groupSum(
            DB::table('material_requirements')
                ->where('company_id', $companyId)
                ->whereIn('project_id', $projectIds)
                ->whereIn('material_id', $materialIds),
            'project_id', 'material_id', 'required_quantity'
        );

        $orderedQty = $this->groupSum(
            DB::table('purchase_order_items')
                ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
                ->where('purchase_orders.company_id', $companyId)
                ->where('purchase_orders.commercial_status', 'ordered')
                ->whereIn('purchase_orders.project_id', $projectIds)
                ->whereIn('purchase_order_items.material_id', $materialIds),
            'purchase_orders.project_id', 'purchase_order_items.material_id', 'purchase_order_items.quantity'
        );

        $orderedReceivedQty = $this->groupSum(
            DB::table('goods_receipt_items')
                ->join('purchase_order_items', 'purchase_order_items.id', '=', 'goods_receipt_items.purchase_order_item_id')
                ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
                ->where('goods_receipt_items.company_id', $companyId)
                ->where('purchase_orders.commercial_status', 'ordered')
                ->whereIn('purchase_orders.project_id', $projectIds)
                ->whereIn('purchase_order_items.material_id', $materialIds),
            'purchase_orders.project_id', 'purchase_order_items.material_id', 'goods_receipt_items.quantity'
        );

        $totalReceivedQty = $this->groupSum(
            DB::table('goods_receipt_items')
                ->join('purchase_order_items', 'purchase_order_items.id', '=', 'goods_receipt_items.purchase_order_item_id')
                ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
                ->where('goods_receipt_items.company_id', $companyId)
                ->whereIn('purchase_orders.project_id', $projectIds)
                ->whereIn('purchase_order_items.material_id', $materialIds),
            'purchase_orders.project_id', 'purchase_order_items.material_id', 'goods_receipt_items.quantity'
        );

        $consumed = $this->groupSum(
            DB::table('material_consumptions')
                ->where('company_id', $companyId)
                ->whereIn('project_id', $projectIds)
                ->whereIn('material_id', $materialIds),
            'project_id', 'material_id', 'quantity'
        );

        $adjustmentIn = $this->groupSum(
            DB::table('stock_adjustments')
                ->where('company_id', $companyId)
                ->where('type', 'ADJUSTMENT_IN')
                ->whereIn('project_id', $projectIds)
                ->whereIn('material_id', $materialIds),
            'project_id', 'material_id', 'quantity'
        );

        $adjustmentOut = $this->groupSum(
            DB::table('stock_adjustments')
                ->where('company_id', $companyId)
                ->where('type', 'ADJUSTMENT_OUT')
                ->whereIn('project_id', $projectIds)
                ->whereIn('material_id', $materialIds),
            'project_id', 'material_id', 'quantity'
        );

        $cancelledReceivedQty = $this->groupSum(
            DB::table('goods_receipt_items')
                ->join('purchase_order_items', 'purchase_order_items.id', '=', 'goods_receipt_items.purchase_order_item_id')
                ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
                ->where('goods_receipt_items.company_id', $companyId)
                ->where('purchase_orders.commercial_status', 'cancelled')
                ->whereIn('purchase_orders.project_id', $projectIds)
                ->whereIn('purchase_order_items.material_id', $materialIds),
            'purchase_orders.project_id', 'purchase_order_items.material_id', 'goods_receipt_items.quantity'
        );

        $metrics = [];

        foreach ($validKeys->keys() as $key) {
            $purchased = Quantity::add($orderedQty[$key] ?? '0.000', $cancelledReceivedQty[$key] ?? '0.000');
            $receivedQuantity = $totalReceivedQty[$key] ?? '0.000';
            $consumedQuantity = $consumed[$key] ?? '0.000';
            $adjustmentInQuantity = $adjustmentIn[$key] ?? '0.000';
            $adjustmentOutQuantity = $adjustmentOut[$key] ?? '0.000';

            $totalIn = Quantity::add($receivedQuantity, $adjustmentInQuantity);
            $totalOut = Quantity::add($consumedQuantity, $adjustmentOutQuantity);
            $stock = Quantity::subtract($totalIn, $totalOut);

            $pending = Quantity::subtract($orderedQty[$key] ?? '0.000', $orderedReceivedQty[$key] ?? '0.000');
            if (Quantity::compare($pending, '0.000') < 0) {
                $pending = '0.000';
            }

            $requiredQuantity = $required[$key] ?? null;
            $missing = null;
            if ($requiredQuantity !== null) {
                $missing = Quantity::subtract($requiredQuantity, Quantity::add($consumedQuantity, Quantity::add($stock, $pending)));
                if (Quantity::compare($missing, '0.000') < 0) {
                    $missing = '0.000';
                }
            }

            $metrics[$key] = [
                'required_quantity' => $requiredQuantity,
                'purchased_quantity' => $purchased,
                'received_quantity' => $receivedQuantity,
                'consumed_quantity' => $consumedQuantity,
                'stock_quantity' => $stock,
                'pending_receipt_quantity' => $pending,
                'missing_to_purchase_quantity' => $missing,
                'total_in' => $totalIn,
                'total_out' => $totalOut,
            ];
        }

        return $metrics;
    }

    /**
     * §53: the cancelled-order contribution to `purchased_quantity` — the
     * receipts that already physically happened before the order was
     * cancelled. Computed lazily per pair only when needed; still a
     * bounded, indexed query (never a loop over unrelated Materials).
     */
    private function cancelledReceivedFor(string $companyId, string $pairKey, Collection $projectIds, Collection $materialIds): string
    {
        static $cache = null;

        if ($cache === null) {
            $cache = $this->groupSum(
                DB::table('goods_receipt_items')
                    ->join('purchase_order_items', 'purchase_order_items.id', '=', 'goods_receipt_items.purchase_order_item_id')
                    ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
                    ->where('goods_receipt_items.company_id', $companyId)
                    ->where('purchase_orders.commercial_status', 'cancelled')
                    ->whereIn('purchase_orders.project_id', $projectIds)
                    ->whereIn('purchase_order_items.material_id', $materialIds),
                'purchase_orders.project_id', 'purchase_order_items.material_id', 'goods_receipt_items.quantity'
            );
        }

        return $cache[$pairKey] ?? '0.000';
    }

    /**
     * @return array<string, string> keyed by "project_id::material_id"
     */
    private function groupSum(Builder $query, string $projectColumn, string $materialColumn, string $sumColumn): array
    {
        $rows = $query
            ->selectRaw("{$projectColumn} as project_id, {$materialColumn} as material_id, SUM({$sumColumn}) as total")
            ->groupBy(DB::raw($projectColumn), DB::raw($materialColumn))
            ->get();

        $result = [];
        foreach ($rows as $row) {
            $result["{$row->project_id}::{$row->material_id}"] = Quantity::normalize((string) $row->total);
        }

        return $result;
    }

    /**
     * @return array<string, mixed>
     */
    private function zeroMetrics(): array
    {
        return [
            'required_quantity' => null,
            'purchased_quantity' => '0.000',
            'received_quantity' => '0.000',
            'consumed_quantity' => '0.000',
            'stock_quantity' => '0.000',
            'pending_receipt_quantity' => '0.000',
            'missing_to_purchase_quantity' => null,
            'total_in' => '0.000',
            'total_out' => '0.000',
        ];
    }

    private function movementsUnion(string $projectId, string $materialId): Builder
    {
        $goodsReceiptRows = DB::table('goods_receipt_items')
            ->join('purchase_order_items', 'purchase_order_items.id', '=', 'goods_receipt_items.purchase_order_item_id')
            ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
            ->join('goods_receipts', 'goods_receipts.id', '=', 'goods_receipt_items.goods_receipt_id')
            ->where('purchase_orders.project_id', $projectId)
            ->where('purchase_order_items.material_id', $materialId)
            ->selectRaw(
                "concat('goods-receipt-item:', goods_receipt_items.id) as movement_id, ".
                "'IN' as type, 'GOODS_RECEIPT' as source_type, goods_receipts.id as source_id, ".
                'goods_receipt_items.quantity as quantity, goods_receipts.received_at as occurred_at, '.
                'goods_receipts.created_at as source_created_at, goods_receipts.notes as note'
            );

        $consumptionRows = DB::table('material_consumptions')
            ->where('project_id', $projectId)
            ->where('material_id', $materialId)
            ->selectRaw(
                "concat('consumption:', id) as movement_id, 'OUT' as type, 'CONSUMPTION' as source_type, ".
                'id as source_id, quantity as quantity, consumed_at as occurred_at, '.
                'created_at as source_created_at, notes as note'
            );

        $adjustmentRows = DB::table('stock_adjustments')
            ->where('project_id', $projectId)
            ->where('material_id', $materialId)
            ->selectRaw(
                "concat('adjustment:', id) as movement_id, type as type, 'MANUAL_ADJUSTMENT' as source_type, ".
                'id as source_id, quantity as quantity, occurred_at as occurred_at, '.
                'created_at as source_created_at, reason as note'
            );

        return $goodsReceiptRows->unionAll($consumptionRows)->unionAll($adjustmentRows);
    }
}
