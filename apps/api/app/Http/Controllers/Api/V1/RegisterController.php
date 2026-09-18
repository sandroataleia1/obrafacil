<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\CompanyRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterRequest;
use App\Models\Company;
use App\Models\User;
use App\Support\MePayload;
use App\Support\RegistrationSessionBootstrapper;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

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
 *
 * AUTH-REGISTER-ATOMICITY-01: the DB writes and the session-side
 * bootstrap (login/regenerate/activate company) both live inside the
 * SAME `DB::transaction()` closure — the old design committed
 * Company+User+Membership BEFORE ever touching auth/session, so a
 * failure there (most concretely: a request with no usable session)
 * left a fully-created-but-unreachable account behind. Session writes
 * are not part of the SQL transaction (the session store only persists
 * at the end of the request, via middleware), so an exception thrown
 * after the session was touched still needs an explicit best-effort
 * `cleanupSession()` — otherwise the eventually-saved session could end
 * up authenticated as a User whose row was just rolled back.
 */
class RegisterController extends Controller
{
    public function __construct(private readonly RegistrationSessionBootstrapper $sessionBootstrapper) {}

    public function __invoke(RegisterRequest $request): JsonResponse
    {
        if ($request->user() !== null) {
            return response()->json([
                'message' => 'Você já está autenticado. Saia da conta atual antes de registrar uma nova empresa.',
            ], 409);
        }

        // §3/§4: a request that never received the stateful-session
        // middleware (no recognized frontend origin, or the session
        // driver itself is unavailable) cannot open an account it would
        // then be unable to authenticate into. Checked BEFORE any
        // INSERT — zero Company/User/Membership for this request.
        if (! $request->hasSession()) {
            return response()->json([
                'message' => 'Não foi possível iniciar uma sessão segura. Recarregue a página e tente novamente.',
            ], 503);
        }

        $sessionTouched = false;

        try {
            $payload = DB::transaction(function () use ($request, &$sessionTouched) {
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

                // §6/§7: from this point on, the session may have been
                // mutated even if a later step throws — `$sessionTouched`
                // tells the catch block below whether `cleanupSession()`
                // needs to run.
                $sessionTouched = true;
                $this->sessionBootstrapper->login($request, $user);
                $this->sessionBootstrapper->regenerateSession($request);
                $this->sessionBootstrapper->activateCompany($company->id);

                // §20: built inside the same protected unit, once
                // Membership + active company are already coherent — the
                // path from a successful commit to the response stays
                // minimal, with nothing left that could still turn an
                // already-persisted registration into a 500.
                return MePayload::build($user);
            });
        } catch (Throwable $e) {
            if ($sessionTouched) {
                $this->cleanupSession($request);
            }

            if ($e instanceof QueryException && $this->isUniqueEmailViolation($e)) {
                throw ValidationException::withMessages([
                    'email' => ['Este e-mail já está em uso.'],
                ]);
            }

            throw $e;
        }

        return response()->json($payload, 201);
    }

    /**
     * §7/§9: if the session store itself is broken, `cleanup()` can fail
     * too — that secondary failure is swallowed here so it never
     * replaces the original exception the caller is already handling.
     */
    private function cleanupSession(Request $request): void
    {
        try {
            $this->sessionBootstrapper->cleanup($request);
        } catch (Throwable) {
            // Secondary failure during cleanup — the original exception
            // is what gets thrown/reported, never this one.
        }
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
