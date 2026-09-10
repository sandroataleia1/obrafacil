<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Machine-to-machine auth for the Evolution webhook (§30/§31) — never
 * Sanctum, since the caller is a server, not a browser session. A
 * configured-but-mismatched or entirely absent secret both mean
 * "reject" — hash_equals() specifically to avoid a timing side-channel on
 * the comparison.
 */
class VerifyEvolutionWebhookSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) config('evolution.webhook_secret');
        $provided = (string) $request->header('X-ObraFacil-Webhook-Secret', '');

        if ($expected === '' || ! hash_equals($expected, $provided)) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        return $next($request);
    }
}
