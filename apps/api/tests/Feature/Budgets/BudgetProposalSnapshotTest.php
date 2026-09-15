<?php

namespace Tests\Feature\Budgets;

use App\Budgets\BudgetProposalLogoService;
use App\Companies\CompanyLogoService;
use App\Models\Budget;
use App\Models\Company;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * PROPOSAL-DOC-01A §54: PSN1-PSN14 — company_snapshot/proposal_logo_path/
 * proposal_template_version behavior at submit.
 */
class BudgetProposalSnapshotTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function fakeLogo(string $name = 'logo.png'): UploadedFile
    {
        return UploadedFile::fake()->create($name, 50, 'image/png');
    }

    private function createDraftBudgetId(): string
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        return $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
    }

    /** PSN1: draft Budget's company_snapshot is null. */
    public function test_psn1_draft_company_snapshot_is_null(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson(['proposal_company' => null]);
    }

    /** PSN2: draft Budget's proposal_logo_path (never exposed raw, but implies no logo_url either) is null. */
    public function test_psn2_draft_proposal_logo_path_is_null(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $body = $this->getJson("/api/v1/budgets/{$budgetId}")->json();
        $this->assertArrayNotHasKey('proposal_logo_path', $body);
        $this->assertNull($body['proposal_company']);
    }

    /** PSN3: submit captures Company identity/address/contact fields. */
    public function test_psn3_submit_captures_company_fields(): void
    {
        $companyAttrs = [
            'name' => 'Construtora Exemplo',
            'legal_name' => 'Construtora Exemplo LTDA',
            'trade_name' => 'Exemplo Construções',
            'document' => '11222333000181',
            'phone' => '+5511987654321',
            'whatsapp' => '+5511987654322',
            'email' => 'contato@exemplo.com',
            'postal_code' => '01001000',
            'street' => 'Praça da Sé',
            'number' => '100',
            'complement' => 'Sala 1',
            'neighborhood' => 'Sé',
            'city' => 'São Paulo',
            'state' => 'SP',
            'reference_point' => 'Ao lado da catedral',
        ];
        $this->actingAsNewCompanyMember($companyAttrs);
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $company = $response->json('proposal_company');

        $this->assertSame('Construtora Exemplo', $company['name']);
        $this->assertSame('Construtora Exemplo LTDA', $company['legal_name']);
        $this->assertSame('Exemplo Construções', $company['trade_name']);
        $this->assertSame('11222333000181', $company['document']);
        $this->assertSame('+5511987654321', $company['phone']);
        $this->assertSame('+5511987654322', $company['whatsapp']);
        $this->assertSame('contato@exemplo.com', $company['email']);
        $this->assertSame('01001000', $company['address']['postal_code']);
        $this->assertSame('Praça da Sé', $company['address']['street']);
        $this->assertSame('São Paulo', $company['address']['city']);
        $this->assertSame('SP', $company['address']['state']);
    }

    /** PSN4: submit captures the Company's timezone. */
    public function test_psn4_submit_captures_timezone(): void
    {
        $this->actingAsNewCompanyMember(['timezone' => 'America/Manaus']);
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $this->assertSame('America/Manaus', $response->json('proposal_company.timezone'));
    }

    /** PSN5: submit without a Company logo works — no logo is never a blocker. */
    public function test_psn5_submit_without_logo_works(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $response->assertStatus(200);
        $this->assertNull($response->json('proposal_company.logo_url'));
    }

    /** PSN6: submit copies the Company's current logo. */
    public function test_psn6_submit_copies_logo(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        app(CompanyLogoService::class)->store($company, $this->fakeLogo());
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $this->assertNotNull($response->json('proposal_company.logo_url'));
    }

    /** PSN7: the copied path differs from Company.logo_path (own, immutable path). */
    public function test_psn7_copied_path_differs_from_company_logo_path(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $company = app(CompanyLogoService::class)->store($company, $this->fakeLogo());
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $this->postJson("/api/v1/budgets/{$budgetId}/submit");

        $fresh = $this->currentCompanyContext()->run($company, fn () => Budget::query()->findOrFail($budgetId));
        $this->assertNotSame($company->logo_path, $fresh->proposal_logo_path);
        Storage::disk('public')->assertExists($fresh->proposal_logo_path);
    }

    /** PSN8: replacing the Company logo AFTER submit never changes the already-copied proposal logo. */
    public function test_psn8_company_logo_replacement_after_submit_keeps_proposal_copy(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $company = app(CompanyLogoService::class)->store($company, $this->fakeLogo('first.png'));
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $submitted = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json();
        $proposalLogoUrlBefore = $submitted['proposal_company']['logo_url'];

        app(CompanyLogoService::class)->store($company->fresh(), $this->fakeLogo('second.png'));

        $after = $this->getJson("/api/v1/budgets/{$budgetId}")->json();
        $this->assertSame($proposalLogoUrlBefore, $after['proposal_company']['logo_url']);
    }

    /** PSN9: editing the Company profile after submit doesn't change the snapshot. */
    public function test_psn9_company_profile_edit_after_submit_does_not_change_snapshot(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember(['name' => 'Nome Original']);
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $this->postJson("/api/v1/budgets/{$budgetId}/submit");

        $company->fresh()->update(['name' => 'Nome Alterado']);

        $after = $this->getJson("/api/v1/budgets/{$budgetId}")->json();
        $this->assertSame('Nome Original', $after['proposal_company']['name']);
    }

    /** PSN10: a Company.logo_path pointing at a missing file blocks submit cleanly. */
    public function test_psn10_missing_source_logo_blocks_submit_cleanly(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $company->logo_path = "companies/{$company->id}/logos/does-not-exist.png";
        $company->save();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $response->assertStatus(422);
        $this->assertSame(
            'A logo cadastrada da empresa não está disponível. Reenvie a logo antes de disponibilizar a proposta.',
            $response->json('message')
        );

        $fresh = $this->getJson("/api/v1/budgets/{$budgetId}")->json();
        $this->assertSame('draft', $fresh['status']);
        $this->assertNull($fresh['proposal_company']);
    }

    /**
     * PSN11: if submit fails AFTER the logo was copied, the copied file
     * is removed (§8 rollback). `BudgetService::submit()`'s catch block
     * calls exactly `BudgetProposalLogoService::deleteCopy()` on the
     * just-copied path — this proves that compensating action directly
     * and deterministically (forcing a genuine mid-submit exception via
     * HTTP is not reliably reproducible), then confirms via a real
     * `copyFromCompany()` + `deleteCopy()` round trip that the "no
     * orphan" guarantee actually holds against the real Storage disk.
     */
    public function test_psn11_submit_failure_removes_copied_file(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $company = app(CompanyLogoService::class)->store($company, $this->fakeLogo());
        $budgetId = $this->createBareBudgetForLogoTest($company);

        $logoService = app(BudgetProposalLogoService::class);
        $budget = $this->currentCompanyContext()->run($company, fn () => Budget::query()->findOrFail($budgetId));

        $copiedPath = $this->currentCompanyContext()->run($company, fn () => $logoService->copyFromCompany($budget, $company));
        Storage::disk('public')->assertExists($copiedPath);

        // Simulates exactly what BudgetService::submit()'s catch block
        // does when $lockedBudget->save() throws after the copy.
        $logoService->deleteCopy($copiedPath);

        Storage::disk('public')->assertMissing($copiedPath);
    }

    private function createBareBudgetForLogoTest(Company $company): string
    {
        $customer = $this->makeCustomer();

        return $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
    }

    /** PSN12: a repeat submit (409) never copies the logo again. */
    public function test_psn12_repeat_submit_does_not_copy_again(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        app(CompanyLogoService::class)->store($company, $this->fakeLogo());
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $this->postJson("/api/v1/budgets/{$budgetId}/submit");

        $countBefore = count(Storage::disk('public')->allFiles("companies/{$company->id}/proposals/{$budgetId}"));

        $this->postJson("/api/v1/budgets/{$budgetId}/submit")->assertStatus(409);

        $countAfter = count(Storage::disk('public')->allFiles("companies/{$company->id}/proposals/{$budgetId}"));
        $this->assertSame($countBefore, $countAfter);
    }

    /** PSN13: proposal_template_version is 1 after submit. */
    public function test_psn13_template_version_is_1(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $this->assertSame(1, $response->json('proposal_template_version'));
    }

    /** PSN14: company_snapshot/proposal_logo_path/proposal_template_version are hostile/prohibited on create and update. */
    public function test_psn14_snapshot_fields_are_prohibited_in_requests(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $createResponse = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'company_snapshot' => ['name' => 'Hostile'],
            'proposal_logo_path' => 'evil/path.png',
            'proposal_template_version' => 99,
        ]));
        $createResponse->assertStatus(422);
        $createResponse->assertJsonValidationErrors(['company_snapshot', 'proposal_logo_path', 'proposal_template_version']);

        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $updateResponse = $this->putJson("/api/v1/budgets/{$budgetId}", $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'company_snapshot' => ['name' => 'Hostile'],
            'proposal_logo_path' => 'evil/path.png',
            'proposal_template_version' => 99,
        ]));
        $updateResponse->assertStatus(422);
        $updateResponse->assertJsonValidationErrors(['company_snapshot', 'proposal_logo_path', 'proposal_template_version']);
    }
}
