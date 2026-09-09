<?php

namespace Tests\Feature\Auth\Concerns;

use App\Models\User;
use Illuminate\Cookie\CookieValuePrefix;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Testing\TestResponse;

/**
 * Real requests only get session/CSRF handling (EnsureFrontendRequestsAreStateful)
 * when they look like they came from a recognized frontend origin — matched
 * against SANCTUM_STATEFUL_DOMAINS via the Referer/Origin header. These tests
 * therefore always send a Referer, and manually relay Set-Cookie values
 * between requests the same way a browser's cookie jar would — Laravel's
 * test client does not do this automatically.
 *
 * (Note: PreventRequestForgery already skips CSRF verification while running
 * under PHPUnit, so this trait doesn't need to thread an X-XSRF-TOKEN header.
 * The real CSRF handshake — cookie + header, including the negative case —
 * is exercised separately by a real HTTP smoke test against the running
 * container, not by PHPUnit.)
 */
trait InteractsWithStatefulRequests
{
    protected function statefulHeaders(): array
    {
        return ['Referer' => 'http://localhost:3000'];
    }

    /**
     * Prepares the test client for the "next request" after $response,
     * exactly like a real browser would: carries forward any Set-Cookie
     * values, AND forgets resolved auth guards.
     *
     * The guard reset matters only inside PHPUnit: in production every HTTP
     * request is a fresh process, so nothing ever carries a stale resolved
     * user across requests. Here, the same app container (and therefore the
     * same cached guard instances — Sanctum's RequestGuard included, which
     * memoizes its result in $this->user once resolved) survives across
     * every postJson()/getJson() call in one test method. Without this, a
     * guard that resolved "authenticated" on the login call would keep
     * answering "authenticated" even after a later logout() call clears the
     * session — not because logout is broken, but because nothing forced
     * that stale guard to look again.
     */
    protected function carryCookiesFrom(TestResponse $response): static
    {
        foreach ($response->headers->getCookies() as $cookie) {
            $this->withCookie($cookie->getName(), $cookie->getValue());
        }

        Auth::forgetGuards();

        return $this;
    }

    /**
     * Performs a real POST /api/v1/login and leaves the resulting session
     * cookies attached to the test client for the next call — callers don't
     * need to remember to carryCookiesFrom() this one specifically.
     */
    protected function loginAs(User $user, string $password): TestResponse
    {
        $response = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => $password,
        ]);

        $this->carryCookiesFrom($response);

        return $response;
    }

    /**
     * Decrypts a Set-Cookie value the same way EncryptCookies would on the
     * way in, so tests can compare real session IDs (not just raw encrypted
     * bytes, which differ on every encryption regardless of content due to
     * a random IV — that alone would never prove the ID actually changed).
     */
    protected function decryptCookieValue(TestResponse $response, string $name): ?string
    {
        $cookie = collect($response->headers->getCookies())->first(fn ($c) => $c->getName() === $name);

        if ($cookie === null) {
            return null;
        }

        $decrypted = Crypt::decrypt($cookie->getValue(), EncryptCookies::serialized($name));

        return CookieValuePrefix::remove($decrypted);
    }
}
