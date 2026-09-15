<?php

namespace Tests\Feature\Budgets;

use App\Companies\CompanyLogoService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * PROPOSAL-DOC-01A §56: PPC1-PPC12 — the public proposal's `company`
 * block, sourced exclusively from the frozen snapshot.
 */
class PublicProposalCompanyTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    /**
     * @return array{0: string, 1: string} [budgetId, proposalToken]
     */
    private function submittedBudgetWithCompany(array $companyAttrs = []): array
    {
        $this->actingAsNewCompanyMember($companyAttrs);
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        return [$budgetId, $token];
    }

    /** PPC1: public company.name. */
    public function test_ppc1_public_company_name(): void
    {
        [, $token] = $this->submittedBudgetWithCompany(['name' => 'Empresa Pública Ltda']);

        $this->getJson("/api/v1/proposals/{$token}")->assertJson(['company' => ['name' => 'Empresa Pública Ltda']]);
    }

    /** PPC2: public company.legal_name/trade_name. */
    public function test_ppc2_public_legal_trade_name(): void
    {
        [, $token] = $this->submittedBudgetWithCompany(['legal_name' => 'Razão Social LTDA', 'trade_name' => 'Nome Fantasia']);

        $this->getJson("/api/v1/proposals/{$token}")->assertJson([
            'company' => ['legal_name' => 'Razão Social LTDA', 'trade_name' => 'Nome Fantasia'],
        ]);
    }

    /** PPC3: public company.document. */
    public function test_ppc3_public_document(): void
    {
        [, $token] = $this->submittedBudgetWithCompany(['document' => '11222333000181']);

        $this->getJson("/api/v1/proposals/{$token}")->assertJson(['company' => ['document' => '11222333000181']]);
    }

    /** PPC4: public company.phone/whatsapp/email. */
    public function test_ppc4_public_phone_whatsapp_email(): void
    {
        [, $token] = $this->submittedBudgetWithCompany([
            'phone' => '+5511987654321', 'whatsapp' => '+5511987654322', 'email' => 'contato@empresa.com',
        ]);

        $this->getJson("/api/v1/proposals/{$token}")->assertJson([
            'company' => ['phone' => '+5511987654321', 'whatsapp' => '+5511987654322', 'email' => 'contato@empresa.com'],
        ]);
    }

    /** PPC5: public company.address. */
    public function test_ppc5_public_address(): void
    {
        [, $token] = $this->submittedBudgetWithCompany([
            'postal_code' => '01001000', 'street' => 'Praça da Sé', 'city' => 'São Paulo', 'state' => 'SP',
        ]);

        $company = $this->getJson("/api/v1/proposals/{$token}")->json('company');
        $this->assertSame('01001000', $company['address']['postal_code']);
        $this->assertSame('Praça da Sé', $company['address']['street']);
        $this->assertSame('São Paulo', $company['address']['city']);
        $this->assertSame('SP', $company['address']['state']);
    }

    /** PPC6: public company.logo_url derives from the frozen proposal snapshot, not the live logo. */
    public function test_ppc6_public_logo_url_from_proposal_snapshot(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        app(CompanyLogoService::class)->store($company, UploadedFile::fake()->create('logo.png', 50, 'image/png'));
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        $public = $this->getJson("/api/v1/proposals/{$token}")->json();
        $this->assertNotNull($public['company']['logo_url']);
    }

    /** PPC7: public response never exposes company_id. */
    public function test_ppc7_no_company_id(): void
    {
        [, $token] = $this->submittedBudgetWithCompany();

        $response = $this->getJson("/api/v1/proposals/{$token}");
        $response->assertJsonMissingPath('company.id');
        $response->assertJsonMissingPath('company_id');
    }

    /** PPC8: public response never exposes logo_path (only the derived logo_url). */
    public function test_ppc8_no_logo_path(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        app(CompanyLogoService::class)->store($company, UploadedFile::fake()->create('logo.png', 50, 'image/png'));
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        $response = $this->getJson("/api/v1/proposals/{$token}");
        $response->assertJsonMissingPath('company.logo_path');
        $response->assertJsonMissingPath('company.proposal_logo_path');
        $this->assertStringNotContainsString('proposal_logo_path', $response->getContent());
    }

    /** PPC9: a Company name change after submit never alters the public proposal. */
    public function test_ppc9_profile_name_change_does_not_alter_public(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember(['name' => 'Nome Antes']);
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        $company->fresh()->update(['name' => 'Nome Depois']);

        $this->getJson("/api/v1/proposals/{$token}")->assertJson(['company' => ['name' => 'Nome Antes']]);
    }

    /** PPC10: a Company address change after submit never alters the public proposal. */
    public function test_ppc10_profile_address_change_does_not_alter_public(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember(['city' => 'Cidade Antes']);
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        $company->fresh()->update(['city' => 'Cidade Depois']);

        $this->getJson("/api/v1/proposals/{$token}")->assertJson(['company' => ['address' => ['city' => 'Cidade Antes']]]);
    }

    /** PPC11: deleting the Company logo after submit never alters the public proposal's logo_url. */
    public function test_ppc11_profile_logo_delete_does_not_alter_public(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $company = app(CompanyLogoService::class)->store($company, UploadedFile::fake()->create('logo.png', 50, 'image/png'));
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');
        $before = $this->getJson("/api/v1/proposals/{$token}")->json('company.logo_url');

        app(CompanyLogoService::class)->delete($company->fresh());

        $after = $this->getJson("/api/v1/proposals/{$token}")->json('company.logo_url');
        $this->assertNotNull($before);
        $this->assertSame($before, $after);
    }

    /** PPC12: the public proposal endpoint still works fully unauthenticated. */
    public function test_ppc12_public_proposal_works_unauthenticated(): void
    {
        [, $token] = $this->submittedBudgetWithCompany();

        // A brand-new test client with no session/auth at all.
        $this->app['auth']->forgetGuards();
        $response = $this->getJson("/api/v1/proposals/{$token}");
        $response->assertOk();
        $this->assertNotNull($response->json('company'));
    }
}
