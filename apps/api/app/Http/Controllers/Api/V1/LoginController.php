<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Support\ActiveCompanySession;
use App\Support\MePayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class LoginController extends Controller
{
    public function __invoke(LoginRequest $request): JsonResponse
    {
        if (! Auth::guard('web')->attempt($request->only('email', 'password'))) {
            // Same message regardless of whether the email exists at all.
            return response()->json([
                'message' => 'These credentials do not match our records.',
            ], 422);
        }

        // Prevents session fixation: a new session ID is issued on every
        // successful login, never reusing whatever pre-auth session existed.
        $request->session()->regenerate();

        $user = Auth::guard('web')->user();
        $memberships = $user->memberships()->get();

        if ($memberships->isEmpty()) {
            // Credentials were valid, but this account has nowhere to work
            // in — never leave a half-authenticated session lying around.
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'message' => 'No company is available for this user.',
            ], 403);
        }

        if ($memberships->count() === 1) {
            ActiveCompanySession::set($memberships->first()->company_id);
        } else {
            // Deliberately not auto-selected: ambiguous until the frontend
            // calls POST /api/v1/companies/{company}/activate.
            ActiveCompanySession::forget();
        }

        return response()->json(MePayload::build($user));
    }
}
