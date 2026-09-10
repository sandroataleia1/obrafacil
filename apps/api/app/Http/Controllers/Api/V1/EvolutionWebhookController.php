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
 *
 * BACKEND-03A §13/§15 — `(provider, provider_message_id)` is indexed, not
 * unique. Whether `provider_instance` needs to join that correlation key is
 * an open question deliberately left for EVOLUTION-01: Evolution operates
 * per-instance on the send endpoint, so it's plausible the real webhook
 * payload carries an instance identifier too, and that message ids are only
 * unique *within* an instance — but that has not been verified against the
 * real VPS, so no column or constraint is added on that guess here. Instead
 * this controller treats ambiguity as a real, structurally possible outcome
 * (see the >1-match branch below) rather than assuming it away.
 *
 * BACKEND-03A §16 — early callback, documented and NOT solved here: it is
 * possible for Evolution to accept a message, generate a
 * provider_message_id, and call this webhook before
 * SendWhatsAppNotificationJob has finished persisting that same id onto the
 * delivery row. In that ordering, the lookup below finds zero matches and
 * this webhook call is logged as `unknown_message_id` and dropped — the
 * status update this callback carried is lost. No inbox/reconciliation
 * mechanism is built for this in this round (deliberately: this problem's
 * shape depends on the real send/webhook ordering and on whether Evolution
 * retries webhook delivery, neither of which is known yet). EVOLUTION-01
 * must decide whether that's acceptable or requires a webhook inbox that
 * retries unresolved callbacks against not-yet-persisted provider_message_ids.
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

        $matches = NotificationDelivery::withoutCompanyScope()
            ->where('provider', 'evolution')
            ->where('provider_message_id', $result->providerMessageId)
            ->get();

        if ($matches->isEmpty()) {
            Log::warning('evolution.webhook.unknown_message_id', [
                'provider_message_id' => $result->providerMessageId,
            ]);

            return response()->json(['status' => 'ignored'], 200);
        }

        if ($matches->count() > 1) {
            // §13/§14: provider_message_id is only indexed, not proven
            // globally unique against the real Evolution instance yet — an
            // ambiguous match is never resolved by guessing (first(),
            // "most recent", or any other arbitrary pick could silently
            // update the wrong tenant's delivery). Nothing is updated;
            // this stays an explicit, auditable EVOLUTION-01 concern.
            Log::warning('evolution.webhook.ambiguous_message_id', [
                'provider_message_id' => $result->providerMessageId,
                'match_count' => $matches->count(),
            ]);

            return response()->json(['status' => 'ignored'], 200);
        }

        $delivery = $matches->first();

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
