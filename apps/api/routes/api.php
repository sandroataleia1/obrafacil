<?php

use App\Http\Controllers\Api\V1\CatalogItemController;
use App\Http\Controllers\Api\V1\CompanyActivationController;
use App\Http\Controllers\Api\V1\CompanyRegistryLookupController;
use App\Http\Controllers\Api\V1\CustomerAddressController;
use App\Http\Controllers\Api\V1\CustomerContactController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\EvolutionWebhookController;
use App\Http\Controllers\Api\V1\LoginController;
use App\Http\Controllers\Api\V1\LogoutController;
use App\Http\Controllers\Api\V1\MeController;
use App\Http\Controllers\Api\V1\NotificationSettingsController;
use App\Http\Controllers\Api\V1\PostalCodeLookupController;
use App\Http\Controllers\Api\V1\RegisterController;
use App\Http\Controllers\Api\V1\ServiceOrderController;
use App\Http\Controllers\Api\V1\ServiceOrderItemController;
use App\Http\Controllers\Api\V1\ServiceOrderSettingsController;
use App\Http\Controllers\Api\V1\ServiceOrderStatusController;
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

        Route::get('/v1/catalog-items', [CatalogItemController::class, 'index']);
        Route::post('/v1/catalog-items', [CatalogItemController::class, 'store']);
        Route::get('/v1/catalog-items/{catalogItem}', [CatalogItemController::class, 'show']);
        Route::put('/v1/catalog-items/{catalogItem}', [CatalogItemController::class, 'update']);

        // §53: settings routes registered BEFORE the dynamic
        // {serviceOrder} routes below, so "settings" is never swallowed
        // as a ServiceOrder id.
        Route::get('/v1/service-orders/settings', [ServiceOrderSettingsController::class, 'show']);
        Route::put('/v1/service-orders/settings', [ServiceOrderSettingsController::class, 'update']);

        Route::get('/v1/service-orders', [ServiceOrderController::class, 'index']);
        Route::post('/v1/service-orders', [ServiceOrderController::class, 'store']);
        Route::get('/v1/service-orders/{serviceOrder}', [ServiceOrderController::class, 'show']);
        Route::put('/v1/service-orders/{serviceOrder}', [ServiceOrderController::class, 'update']);

        Route::post('/v1/service-orders/{serviceOrder}/start', [ServiceOrderStatusController::class, 'start']);
        Route::post('/v1/service-orders/{serviceOrder}/complete', [ServiceOrderStatusController::class, 'complete']);
        Route::post('/v1/service-orders/{serviceOrder}/cancel', [ServiceOrderStatusController::class, 'cancel']);

        Route::post('/v1/service-orders/{serviceOrder}/items', [ServiceOrderItemController::class, 'store']);
        Route::put('/v1/service-orders/{serviceOrder}/items/{item}', [ServiceOrderItemController::class, 'update']);
        Route::delete('/v1/service-orders/{serviceOrder}/items/{item}', [ServiceOrderItemController::class, 'destroy']);

        Route::middleware('throttle:lookups')->group(function () {
            Route::get('/v1/lookups/cep', [PostalCodeLookupController::class, 'show']);
            Route::get('/v1/lookups/cnpj', [CompanyRegistryLookupController::class, 'show']);
        });
    });
});
