<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\CancelServiceOrderRequest;
use App\Http\Resources\ServiceOrderResource;
use App\Models\ServiceOrder;
use App\ServiceOrders\ServiceOrderService;

/**
 * §48: explicit status-transition endpoints — status is never mutated via
 * the generic PUT (ST14). §54: `{serviceOrder}` resolved explicitly
 * inside each action, never implicit route-model binding.
 */
class ServiceOrderStatusController extends Controller
{
    public function __construct(private readonly ServiceOrderService $service) {}

    public function start(string $serviceOrder): ServiceOrderResource
    {
        $order = ServiceOrder::query()->findOrFail($serviceOrder);
        $order = $this->service->start($order);

        return new ServiceOrderResource($order);
    }

    public function complete(string $serviceOrder): ServiceOrderResource
    {
        $order = ServiceOrder::query()->findOrFail($serviceOrder);
        $order = $this->service->complete($order);

        return new ServiceOrderResource($order);
    }

    public function cancel(CancelServiceOrderRequest $request, string $serviceOrder): ServiceOrderResource
    {
        $order = ServiceOrder::query()->findOrFail($serviceOrder);
        $order = $this->service->cancel($order, $request->validated('reason'));

        return new ServiceOrderResource($order);
    }
}
