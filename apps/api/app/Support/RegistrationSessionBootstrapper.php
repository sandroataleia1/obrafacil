<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * AUTH-REGISTER-ATOMICITY-01 §8: the three session-side steps
 * `RegisterController` performs after creating Company/User/Membership,
 * extracted into their own small, container-resolved class purely so a
 * test can bind a partial double that lets some steps run for real and
 * makes one specific step throw — proving the transaction rolls back
 * regardless of WHICH step failed, without an `app()->testing()`
 * conditional or a parallel test-only code path.
 */
class RegistrationSessionBootstrapper
{
    public function login(Request $request, User $user): void
    {
        Auth::guard('web')->login($user);
    }

    /**
     * Prevents session fixation: a new session ID is issued on every
     * successful register, never reusing whatever pre-register session
     * existed — same rationale as `LoginController`.
     */
    public function regenerateSession(Request $request): void
    {
        $request->session()->regenerate();
    }

    public function activateCompany(string $companyId): void
    {
        ActiveCompanySession::set($companyId);
    }

    /**
     * §7: best-effort — reverses the in-memory session mutations
     * (login/regenerate) so that whatever the session store eventually
     * persists for this request never ends up authenticated as a User
     * whose row was just rolled back. Mirrors `LoginController`'s own
     * zero-membership cleanup exactly. Routed through this class (rather
     * than inlined in the controller) so a test can make it fail too,
     * proving the ORIGINAL exception still wins.
     */
    public function cleanup(Request $request): void
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }
}
