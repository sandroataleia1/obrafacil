<?php

namespace Tests\Feature\MultiTenant;

use App\Enums\CompanyRole;
use App\Http\Middleware\ResolveCurrentCompany;
use App\Models\Company;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\Fixtures\FixtureWidget;
use Tests\TestCase;

/**
 * Proves the full chain future business resources will rely on:
 *
 *   auth:sanctum -> resolve-current-company -> route model binding
 *
 * i.e. by the time a business model is loaded for a route param, the
 * CurrentCompanyContext is already set to the authenticated user's
 * company, so CompanyScope silently excludes rows from any other
 * company — a cross-tenant lookup by known UUID returns 404, not 403,
 * and never leaks the record's existence.
 */
class ResolveCurrentCompanyMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('migrate', [
            '--path' => 'tests/Fixtures/migrations',
            '--realpath' => false,
        ]);

        Route::middleware(['auth:sanctum', ResolveCurrentCompany::class])
            ->get('/_test/fixture-widgets/{id}', function (string $id) {
                return response()->json(FixtureWidget::findOrFail($id));
            });
    }

    public function test_cross_tenant_lookup_by_known_uuid_returns_404(): void
    {
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();

        $userA = User::factory()->create();
        $companyA->memberships()->create(['user_id' => $userA->id, 'role' => CompanyRole::Owner]);

        $context = app(CurrentCompanyContext::class);
        $widgetB = $context->run($companyB, fn () => FixtureWidget::create(['name' => 'B-secret']));

        Sanctum::actingAs($userA);

        $this->getJson("/_test/fixture-widgets/{$widgetB->id}")->assertNotFound();
    }

    public function test_same_tenant_lookup_succeeds(): void
    {
        $companyA = Company::factory()->create();
        $userA = User::factory()->create();
        $companyA->memberships()->create(['user_id' => $userA->id, 'role' => CompanyRole::Owner]);

        $context = app(CurrentCompanyContext::class);
        $widgetA = $context->run($companyA, fn () => FixtureWidget::create(['name' => 'A-visible']));
        $context->clear();

        Sanctum::actingAs($userA);

        $this->getJson("/_test/fixture-widgets/{$widgetA->id}")
            ->assertOk()
            ->assertJsonPath('name', 'A-visible');
    }
}
