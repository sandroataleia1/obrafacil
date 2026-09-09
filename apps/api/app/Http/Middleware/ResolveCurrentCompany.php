<?php

namespace App\Http\Middleware;

use App\Support\CurrentCompanyContext;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Binds the authenticated user's company into CurrentCompanyContext before
 * any business model is loaded, and always leaves the context empty again
 * once the request is done — CurrentCompanyContext is a singleton, so a
 * leftover value here would leak into whatever runs next in the same
 * (persistent) process.
 *
 * Must run after auth:sanctum and before any route-model-bound business
 * resource (e.g. `/customers/{customer}`), so the bound model is already
 * queried under the CompanyScope by the time the controller sees it.
 *
 * The active company is never taken from the request (no header, no query
 * string, no route param) — only from the authenticated user's own
 * membership(s). This is a temporary decision rule, not a final one: real
 * "active company" selection (for users in more than one company) belongs
 * to a future round. Until then:
 *   - 0 memberships  -> 403, request never reaches a tenant-scoped query.
 *   - 1 membership   -> that company becomes current.
 *   - >1 memberships -> 409, since picking one silently would be exactly
 *     the arbitrary-choice behavior this round is meant to avoid.
 */
class ResolveCurrentCompany
{
    public function __construct(private readonly CurrentCompanyContext $context) {}

    public function handle(Request $request, Closure $next): Response
    {
        $this->context->clear();

        $user = $request->user();

        if ($user === null) {
            return $next($request);
        }

        $memberships = $user->memberships()->with('company')->get();

        if ($memberships->isEmpty()) {
            return $this->noActiveCompanyResponse();
        }

        if ($memberships->count() > 1) {
            return $this->ambiguousActiveCompanyResponse();
        }

        $this->context->set($memberships->first()->company);

        try {
            return $next($request);
        } finally {
            $this->context->clear();
        }
    }

    private function noActiveCompanyResponse(): JsonResponse
    {
        return response()->json([
            'message' => 'No active company is available for this user.',
        ], 403);
    }

    private function ambiguousActiveCompanyResponse(): JsonResponse
    {
        return response()->json([
            'message' => 'An active company must be selected for this user.',
        ], 409);
    }
}
