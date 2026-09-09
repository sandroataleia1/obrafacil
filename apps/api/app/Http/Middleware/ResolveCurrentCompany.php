<?php

namespace App\Http\Middleware;

use App\Models\Company;
use App\Support\ActiveCompanySession;
use App\Support\CurrentCompanyContext;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Binds the authenticated user's active company into CurrentCompanyContext
 * before any business model is loaded, and always leaves the context empty
 * again once the request is done — CurrentCompanyContext is a singleton, so
 * a leftover value here would leak into whatever runs next in the same
 * (persistent) process.
 *
 * Must run after auth:sanctum and before any route-model-bound business
 * resource (e.g. `/customers/{customer}`), so the bound model is already
 * queried under the CompanyScope by the time the controller sees it.
 *
 * Resolution order:
 *   1. clear any leftover context;
 *   2. read the authenticated user;
 *   3. read active_company_id from the session (ActiveCompanySession);
 *   4. validate that it's still a real membership of this user;
 *   5. if valid, set it as current;
 *   6. if missing/stale, fall back to: 0 memberships -> 403,
 *      exactly 1 -> auto-resolve and persist it to the session,
 *      >1 -> 409 (never chosen arbitrarily);
 *   7. clear the context again in `finally`, whatever happened downstream.
 *
 * The active company is never taken from the request itself (no header, no
 * query string, no route param) — only from the session, which in turn was
 * only ever written by POST /api/v1/login or POST /api/v1/companies/{id}/activate,
 * both of which verify membership before writing it.
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

        $activeCompanyId = ActiveCompanySession::get();

        if ($activeCompanyId !== null) {
            $membership = $user->memberships()->where('company_id', $activeCompanyId)->with('company')->first();

            if ($membership !== null) {
                return $this->proceedWith($membership->company, $request, $next);
            }

            // Session pointed at a company this user is no longer a member
            // of (e.g. membership was revoked after activation) — never use
            // it, and don't leave the stale value sitting in the session.
            ActiveCompanySession::forget();
        }

        $memberships = $user->memberships()->with('company')->get();

        if ($memberships->isEmpty()) {
            return $this->noActiveCompanyResponse();
        }

        if ($memberships->count() > 1) {
            return $this->ambiguousActiveCompanyResponse();
        }

        $company = $memberships->first()->company;
        ActiveCompanySession::set($company->id);

        return $this->proceedWith($company, $request, $next);
    }

    private function proceedWith(Company $company, Request $request, Closure $next): Response
    {
        $this->context->set($company);

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
