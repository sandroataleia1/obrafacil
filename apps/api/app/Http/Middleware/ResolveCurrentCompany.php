<?php

namespace App\Http\Middleware;

use App\Support\CurrentCompanyContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Binds the authenticated user's company into CurrentCompanyContext before
 * any business model is loaded.
 *
 * Must run after auth:sanctum and before any route-model-bound business
 * resource (e.g. `/customers/{customer}`), so the bound model is already
 * queried under the CompanyScope by the time the controller sees it.
 *
 * The active company is never taken from the request (no header, no query
 * string, no route param) — only from the authenticated user's own
 * membership. A user with no membership at all is left without a current
 * company, which means any tenant-scoped query downstream fails closed.
 */
class ResolveCurrentCompany
{
    public function __construct(private readonly CurrentCompanyContext $context) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user !== null) {
            $membership = $user->memberships()->with('company')->first();

            if ($membership !== null) {
                $this->context->set($membership->company);
            }
        }

        return $next($request);
    }
}
