<?php

use App\Http\Controllers\Api\V1\CompanyActivationController;
use App\Http\Controllers\Api\V1\CustomerAddressController;
use App\Http\Controllers\Api\V1\CustomerContactController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\EvolutionWebhookController;
use App\Http\Controllers\Api\V1\LoginController;
use App\Http\Controllers\Api\V1\LogoutController;
use App\Http\Controllers\Api\V1\MeController;
use App\Http\Controllers\Api\V1\NotificationSettingsController;
use App\Http\Controllers\Api\V1\RegisterController;
use Illuminate\Support\Facades\Route;

Route::get('/v1/health', function () {
    return response()->json([
        'status' => 'ok',
    ]);
});

Route::post('/v1/register', RegisterController::class)->middleware('throttle:register');
Route::post('/v1/login', LoginController::class)->middleware('throttle:login');

// Machine-to-machine (Evolution API server), never Sanctum (§30). Not
// configured against the real VPS instance yet — see EVOLUTION-01.
Route::post('/v1/webhooks/evolution', EvolutionWebhookController::class)
    ->middleware('evolution-webhook-secret');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/v1/logout', LogoutController::class);
    Route::get('/v1/me', MeController::class);
    Route::post('/v1/companies/{company}/activate', CompanyActivationController::class);

    Route::middleware('resolve-current-company')->group(function () {
        Route::get('/v1/notifications/settings', [NotificationSettingsController::class, 'show']);
        Route::put('/v1/notifications/settings', [NotificationSettingsController::class, 'update']);

        Route::get('/v1/customers', [CustomerController::class, 'index']);
        Route::post('/v1/customers', [CustomerController::class, 'store']);
        Route::get('/v1/customers/{customer}', [CustomerController::class, 'show']);
        Route::put('/v1/customers/{customer}', [CustomerController::class, 'update']);
        Route::delete('/v1/customers/{customer}', [CustomerController::class, 'destroy']);

        Route::post('/v1/customers/{customer}/addresses', [CustomerAddressController::class, 'store']);
        Route::put('/v1/customers/{customer}/addresses/{address}', [CustomerAddressController::class, 'update']);
        Route::delete('/v1/customers/{customer}/addresses/{address}', [CustomerAddressController::class, 'destroy']);

        Route::post('/v1/customers/{customer}/contacts', [CustomerContactController::class, 'store']);
        Route::put('/v1/customers/{customer}/contacts/{contact}', [CustomerContactController::class, 'update']);
        Route::delete('/v1/customers/{customer}/contacts/{contact}', [CustomerContactController::class, 'destroy']);
    });
});
