<?php

namespace App\Providers;

use App\Notifications\Contracts\WhatsAppProvider;
use App\Notifications\Providers\EvolutionApiProvider;
use App\Support\CurrentCompanyContext;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(CurrentCompanyContext::class);

        // Every domain depends on the WhatsAppProvider interface, never on
        // EvolutionApiProvider directly (Gate BACKEND-03 §2/§5) — swapping
        // providers later means rebinding this, not touching call sites.
        $this->app->bind(WhatsAppProvider::class, function (): EvolutionApiProvider {
            return new EvolutionApiProvider(
                baseUrl: (string) config('evolution.base_url'),
                apiKey: (string) config('evolution.api_key'),
                instance: (string) config('evolution.instance'),
                timeoutSeconds: (int) config('evolution.timeout_seconds'),
            );
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Keyed by normalized email + IP so an attacker can't lock out a
        // legitimate user by spamming their email from many IPs, nor bypass
        // the limit by rotating email guesses from a single IP.
        RateLimiter::for('login', function (Request $request) {
            $key = Str::lower((string) $request->input('email')).'|'.$request->ip();

            return Limit::perMinute(5)->by($key);
        });

        // IP-only (not email+IP like login): registration creates new
        // identities, so keying by an attacker-supplied email would let
        // them rotate emails from one IP to bypass the limit entirely.
        RateLimiter::for('register', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip());
        });
    }
}
