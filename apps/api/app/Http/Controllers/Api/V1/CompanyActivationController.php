<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\ActiveCompanySession;
use App\Support\MePayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The one deliberate, controlled exception to "company_id never comes from
 * the frontend": the frontend names which company it wants active, but the
 * backend verifies membership before trusting it. Company itself is not
 * tenant-scoped, so this never goes through route-model binding — a single
 * membership lookup either succeeds or the response is 404, with no
 * distinction between "no such company" and "not your company".
 */
class CompanyActivationController extends Controller
{
    public function __invoke(Request $request, string $company): JsonResponse
    {
        $user = $request->user();

        $membership = $user->memberships()->where('company_id', $company)->first();

        if ($membership === null) {
            abort(404);
        }

        ActiveCompanySession::set($membership->company_id);

        return response()->json(MePayload::build($user));
    }
}
