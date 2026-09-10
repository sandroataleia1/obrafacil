<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\NotificationDelivery;
use App\Notifications\Webhook\EvolutionWebhookParser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Foundation only (§30-§35) — not wired to the real VPS instance yet
 * (EVOLUTION-01 does that after auditing the installed version).
 *
 * No CurrentCompanyContext here: a webhook has no tenant of its own to
 * assume, and the whole point of this endpoint is to figure out which
 * company/delivery a provider_message_id belongs to. That is the one
 * legitimate use of NotificationDelivery::withoutCompanyScope() — a
 * deliberate, explicit cross-tenant lookup, never a workaround for a
 * missing context elsewhere.
 */
class EvolutionWebhookController extends Controller
{
    public function __invoke(Request $request, EvolutionWebhookParser $parser): JsonResponse
    {
        $payload = $request->all();

        if ($payload === []) {
            return response()->json(['message' => 'Invalid payload.'], 422);
        }

        $result = $parser->parse($payload);

        if (! $result->isRecognized()) {
            // §34: never a 500 for a shape we don't recognize — a 2xx here
            // also avoids the provider retrying (and retrying, and
            // retrying) a callback we were never going to be able to use.
            Log::warning('evolution.webhook.unrecognized_payload');

            return response()->json(['status' => 'ignored'], 200);
        }

        $delivery = NotificationDelivery::withoutCompanyScope()
            ->where('provider', 'evolution')
            ->where('provider_message_id', $result->providerMessageId)
            ->first();

        if ($delivery === null) {
            Log::warning('evolution.webhook.unknown_message_id', [
                'provider_message_id' => $result->providerMessageId,
            ]);

            return response()->json(['status' => 'ignored'], 200);
        }

        // transitionTo() is itself idempotent/monotonic (§16/§33) — a
        // repeated or out-of-order callback (sent after delivered, e.g.)
        // is silently a no-op, never corrupts the delivery.
        $delivery->transitionTo($result->status);

        Log::info('evolution.webhook.processed', [
            'delivery_id' => $delivery->id,
            'company_id' => $delivery->company_id,
            'provider' => $delivery->provider,
            'status' => $delivery->status->value,
        ]);

        return response()->json(['status' => 'ok'], 200);
    }
}
