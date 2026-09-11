<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateServiceOrderSettingsRequest;
use App\Http\Resources\ServiceOrderSettingsResource;
use App\ServiceOrders\ServiceOrderSettingsService;
use Illuminate\Http\JsonResponse;

/**
 * §32-35. Registered BEFORE the dynamic `/service-orders/{serviceOrder}`
 * routes (routes/api.php) so "settings" is never swallowed as a
 * ServiceOrder id.
 */
class ServiceOrderSettingsController extends Controller
{
    public function __construct(private readonly ServiceOrderSettingsService $service) {}

    public function show(): ServiceOrderSettingsResource
    {
        return new ServiceOrderSettingsResource($this->service->get());
    }

    public function update(UpdateServiceOrderSettingsRequest $request): JsonResponse
    {
        $setting = $this->service->update((string) $request->validated('default_travel_fee'));

        // §33: always 200 — this is a singleton upsert, not a resource
        // creation the client should treat as a new entity (Laravel's
        // JsonResource would otherwise auto-return 201 the first time a
        // row is inserted, via $setting->wasRecentlyCreated).
        return (new ServiceOrderSettingsResource($setting))->response()->setStatusCode(200);
    }
}
