<?php

use App\Http\Middleware\ResolveCurrentCompany;
use App\Http\Middleware\VerifyEvolutionWebhookSecret;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Prepends Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful
        // to the "api" group, so requests from a recognized SANCTUM_STATEFUL_DOMAINS
        // origin get session/cookie/CSRF handling instead of (or in addition to)
        // token auth. This is what makes Sanctum SPA (cookie-based) auth work for
        // routes/api.php without a separate "web" middleware group.
        $middleware->statefulApi();

        $middleware->alias([
            'resolve-current-company' => ResolveCurrentCompany::class,
            'evolution-webhook-secret' => VerifyEvolutionWebhookSecret::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
