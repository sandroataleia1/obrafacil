<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\CompanyRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterRequest;
use App\Models\Company;
use App\Models\User;
use App\Support\ActiveCompanySession;
use App\Support\MePayload;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Public "create my account" endpoint: Company + User + owner
 * CompanyMembership are created atomically, then the user is logged in and
 * their new company is made active — no second login required.
 *
 * Every field written to Company/User/CompanyMembership comes from an
 * explicit, named value (request()->string('company_name') etc., or a
 * hardcoded CompanyRole::Owner) — never from $request->all()/validated()
 * spread into create(). A hostile payload with company_id/role/id/
 * active_company_id/created_by simply has nothing in this controller that
 * would ever read those keys.
 */
class RegisterController extends Controller
{
    public function __invoke(RegisterRequest $request): JsonResponse
    {
        if ($request->user() !== null) {
            return response()->json([
                'message' => 'You are already authenticated. Log out before registering a new company.',
            ], 409);
        }

        try {
            [$user] = DB::transaction(function () use ($request) {
                $company = Company::create([
                    'name' => $request->string('company_name')->toString(),
                ]);

                $user = User::create([
                    'name' => $request->string('name')->toString(),
                    'email' => $request->string('email')->toString(),
                    'phone' => $request->string('phone')->toString(),
                    'password' => $request->string('password')->toString(),
                ]);

                $company->memberships()->create([
                    'user_id' => $user->id,
                    'role' => CompanyRole::Owner,
                ]);

                return [$user, $company];
            });
        } catch (QueryException $e) {
            if ($this->isUniqueEmailViolation($e)) {
                throw ValidationException::withMessages([
                    'email' => ['The email has already been taken.'],
                ]);
            }

            throw $e;
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        $membership = $user->memberships()->first();
        ActiveCompanySession::set($membership->company_id);

        return response()->json(MePayload::build($user), 201);
    }

    /**
     * The FormRequest's `unique` rule is a UX convenience, not the real
     * guarantee — two concurrent registrations for the same email can both
     * pass validation before either commits. The database's own unique
     * constraint is the actual authority; this maps that specific
     * constraint violation back into the same 422 shape validation would
     * have produced, instead of letting it surface as a raw 500.
     */
    private function isUniqueEmailViolation(QueryException $e): bool
    {
        return str_contains($e->getMessage(), 'users_email_unique');
    }
}
