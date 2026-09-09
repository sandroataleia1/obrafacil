<?php

use App\Http\Controllers\Api\V1\CompanyActivationController;
use App\Http\Controllers\Api\V1\LoginController;
use App\Http\Controllers\Api\V1\LogoutController;
use App\Http\Controllers\Api\V1\MeController;
use Illuminate\Support\Facades\Route;

Route::get('/v1/health', function () {
    return response()->json([
        'status' => 'ok',
    ]);
});

Route::post('/v1/login', LoginController::class)->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/v1/logout', LogoutController::class);
    Route::get('/v1/me', MeController::class);
    Route::post('/v1/companies/{company}/activate', CompanyActivationController::class);
});
