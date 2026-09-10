<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\NotificationSettingsRequest;
use App\Http\Resources\NotificationSettingsResource;
use App\Notifications\Settings\NotificationSettingsService;
use App\Support\CurrentCompanyContext;
use Illuminate\Http\Request;

/**
 * The configuration belongs to (authenticated user, active company) only
 * (§3) — there is no user_id/company_id in the route or payload, so
 * "another user's settings" is not a reachable state, not just a
 * forbidden one.
 */
class NotificationSettingsController extends Controller
{
    public function __construct(
        private readonly NotificationSettingsService $service,
        private readonly CurrentCompanyContext $context,
    ) {}

    public function show(Request $request): NotificationSettingsResource
    {
        $snapshot = $this->service->effective($this->context->get(), $request->user());

        return new NotificationSettingsResource($snapshot);
    }

    public function update(NotificationSettingsRequest $request): NotificationSettingsResource
    {
        $snapshot = $this->service->save($this->context->get(), $request->user(), $request->validated());

        return new NotificationSettingsResource($snapshot);
    }
}
