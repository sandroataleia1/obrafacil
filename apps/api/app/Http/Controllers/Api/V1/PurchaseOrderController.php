<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\DeletePurchaseOrderRequest;
use App\Http\Requests\ListPurchaseOrderRequest;
use App\Http\Requests\StorePurchaseOrderRequest;
use App\Http\Requests\UpdatePurchaseOrderRequest;
use App\Http\Resources\PurchaseOrderListResource;
use App\Http\Resources\PurchaseOrderResource;
use App\Models\PurchaseOrder;
use App\Purchases\PurchaseOrderFulfillmentService;
use App\Purchases\PurchaseOrderService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * SUPPLY-API-01C §72. `{purchaseOrder}` is never implicitly bound — always
 * resolved explicitly via `PurchaseOrder::query()->findOrFail()`, after
 * `resolve-current-company` has run.
 *
 * SUPPLY-API-01D §29-31/§34/§62-63: every response that reaches a
 * PurchaseOrder{List,}Resource/PurchaseOrderItemResource MUST first pass
 * through `PurchaseOrderFulfillmentService::attachToOrders()` — this is
 * the ONE place that happens for this controller, so fulfillment is never
 * computed inline in a Resource (which would reintroduce N+1) nor
 * skipped.
 */
class PurchaseOrderController extends Controller
{
    private const int DEFAULT_PER_PAGE = 15;

    private const int MAX_PER_PAGE = 100;

    public function __construct(
        private readonly PurchaseOrderService $service,
        private readonly PurchaseOrderFulfillmentService $fulfillmentService,
    ) {}

    public function index(ListPurchaseOrderRequest $request): AnonymousResourceCollection
    {
        $perPage = min(
            (int) ($request->validated('per_page') ?? self::DEFAULT_PER_PAGE),
            self::MAX_PER_PAGE
        );

        $query = PurchaseOrder::query()
            ->with(['supplier:id,name,active', 'project:id,number,name', 'items:id,purchase_order_id,quantity,unit_price']);

        $this->applySearch($query, $request->validated('search'));

        if ($request->filled('commercial_status')) {
            $query->where('commercial_status', $request->validated('commercial_status'));
        }

        if ($request->filled('project_id')) {
            $query->where('project_id', $request->validated('project_id'));
        }

        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->validated('supplier_id'));
        }

        $purchaseOrders = $query
            ->orderBy('updated_at', 'desc')
            ->orderBy('id')
            ->paginate($perPage)
            ->withQueryString();

        // §30/§63: ONE aggregate query for the whole page, never one per row.
        $this->fulfillmentService->attachToOrders($purchaseOrders->getCollection());

        return PurchaseOrderListResource::collection($purchaseOrders);
    }

    public function store(StorePurchaseOrderRequest $request): JsonResponse
    {
        $purchaseOrder = $this->service->create($request->validated());

        return (new PurchaseOrderResource($this->loadForDetail($purchaseOrder)))->response()->setStatusCode(201);
    }

    public function show(string $purchaseOrder): PurchaseOrderResource
    {
        $purchaseOrderModel = PurchaseOrder::query()
            ->with(['supplier', 'project', 'items.material', 'goodsReceipts.items'])
            ->findOrFail($purchaseOrder);

        $this->fulfillmentService->computeAndAttach($purchaseOrderModel);

        return new PurchaseOrderResource($purchaseOrderModel);
    }

    public function update(UpdatePurchaseOrderRequest $request, string $purchaseOrder): PurchaseOrderResource
    {
        $purchaseOrderModel = PurchaseOrder::query()->findOrFail($purchaseOrder);
        $purchaseOrderModel = $this->service->updateHeader($purchaseOrderModel, $request->validated());

        return new PurchaseOrderResource($this->loadForDetail($purchaseOrderModel));
    }

    public function destroy(DeletePurchaseOrderRequest $request, string $purchaseOrder): Response
    {
        $purchaseOrderModel = PurchaseOrder::query()->findOrFail($purchaseOrder);
        $this->service->deleteDraft($purchaseOrderModel, $request->validated('updated_at'));

        return response()->noContent();
    }

    private function loadForDetail(PurchaseOrder $purchaseOrder): PurchaseOrder
    {
        $purchaseOrder->load(['items.material', 'goodsReceipts.items']);
        $this->fulfillmentService->computeAndAttach($purchaseOrder);

        return $purchaseOrder;
    }

    private function applySearch(Builder $query, ?string $search): void
    {
        if ($search === null || trim($search) === '') {
            return;
        }

        $term = trim($search);

        $query->where(function ($q) use ($term) {
            $q->whereHas('supplier', fn ($sq) => $sq->whereRaw('name ILIKE ?', ["%{$term}%"]))
                ->orWhereHas('project', fn ($sq) => $sq->whereRaw('name ILIKE ?', ["%{$term}%"]))
                ->orWhereRaw("('PC-' || lpad(number::text, 6, '0')) ILIKE ?", ["%{$term}%"]);
        });
    }
}
