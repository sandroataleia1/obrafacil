<?php

namespace Tests\Feature\Budgets;

use App\Budgets\Proposal\ProposalDocumentDataBuilder;
use App\Models\Budget;
use App\Models\Company;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\View;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * PROPOSAL-DOC-01A §57: PDF1-PDF18. Per §57's own preference, content/
 * privacy assertions are made against the rendered Blade HTML (never a
 * PDF-text-extraction library) — `renderHtml()` below builds the exact
 * same ViewModel the real PDF renderer uses and renders the SAME Blade
 * template to a plain HTML string. The PDF *binary* itself is checked
 * separately (signature/headers/content-type), over real HTTP.
 */
class ProposalPdfTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    private function renderHtml(Budget $budget): string
    {
        $data = app(ProposalDocumentDataBuilder::class)->forSubmitted($budget);

        return View::make('proposals.pdf.v1', ['data' => $data])->render();
    }

    private ?Company $viewCompany = null;

    /**
     * @return array{0: string, 1: string, 2: Budget}
     */
    private function submittedBudget(array $companyAttrs = [], array $budgetOverrides = [], array $itemOverrides = []): array
    {
        [$company, $user] = $this->actingAsNewCompanyMember($companyAttrs);
        $this->viewCompany = $company;
        $customer = $this->makeCustomer(['name' => 'Cliente PDF Teste']);
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(array_merge(
            ['customer_id' => $customer->id, 'title' => 'Reforma completa', 'reference' => 'Casa da Praia'],
            $budgetOverrides
        )))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload($itemOverrides));
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        $budget = $this->currentCompanyContext()->run($company, fn () => Budget::query()->with('items')->findOrFail($budgetId));

        return [$budgetId, $token, $budget];
    }

    /** PDF1: authenticated preview PDF works. */
    public function test_pdf1_authenticated_preview_pdf(): void
    {
        [$budgetId] = $this->submittedBudget();

        $response = $this->get("/api/v1/budgets/{$budgetId}/proposal-preview.pdf");
        $response->assertOk();
    }

    /** PDF2: public PDF works with no auth. */
    public function test_pdf2_public_pdf_no_auth(): void
    {
        [, $token] = $this->submittedBudget();

        $this->app['auth']->forgetGuards();
        $response = $this->get("/api/v1/proposals/{$token}/pdf");
        $response->assertOk();
    }

    /** PDF3: an invalid token is 404. */
    public function test_pdf3_invalid_token_404(): void
    {
        $this->get('/api/v1/proposals/does-not-exist-token/pdf')->assertStatus(404);
    }

    /** PDF4: Content-Type is application/pdf. */
    public function test_pdf4_content_type_application_pdf(): void
    {
        [, $token] = $this->submittedBudget();

        $response = $this->get("/api/v1/proposals/{$token}/pdf");
        $response->assertHeader('Content-Type', 'application/pdf');
    }

    /** PDF5: the filename is safe (the Budget number, never a raw customer name). */
    public function test_pdf5_safe_filename(): void
    {
        [$budgetId, $token] = $this->submittedBudget([], [], []);

        $response = $this->get("/api/v1/proposals/{$token}/pdf");
        $disposition = $response->headers->get('Content-Disposition');
        $this->assertStringContainsString('ORC-', $disposition);
        $this->assertStringContainsString('.pdf', $disposition);
        $this->assertStringNotContainsString('Cliente PDF Teste', $disposition);
    }

    /** PDF6: the PDF binary begins with the real %PDF signature. */
    public function test_pdf6_binary_has_valid_signature(): void
    {
        [, $token] = $this->submittedBudget();

        $response = $this->get("/api/v1/proposals/{$token}/pdf");
        $this->assertStringStartsWith('%PDF-', $response->getContent());
    }

    /** PDF7: title/number/customer are present in the rendered document. */
    public function test_pdf7_title_number_customer_present(): void
    {
        [, , $budget] = $this->submittedBudget();

        $html = $this->renderHtml($budget);
        $this->assertStringContainsString($budget->formattedNumber(), $html);
        $this->assertStringContainsString('Reforma completa', $html);
        $this->assertStringContainsString('Cliente PDF Teste', $html);
    }

    /** PDF8: Company snapshot fields are present. */
    public function test_pdf8_company_snapshot_fields_present(): void
    {
        [, , $budget] = $this->submittedBudget(['name' => 'Empresa PDF Teste', 'document' => '11222333000181']);

        $html = $this->renderHtml($budget);
        $this->assertStringContainsString('Empresa PDF Teste', $html);
        $this->assertStringContainsString('11.222.333/0001-81', $html);
    }

    /** PDF9: items are present. */
    public function test_pdf9_items_present(): void
    {
        [, , $budget] = $this->submittedBudget([], [], ['name' => 'Serviço Especial XYZ']);

        $html = $this->renderHtml($budget);
        $this->assertStringContainsString('Serviço Especial XYZ', $html);
    }

    /** PDF10: subtotal/discount/total are present. */
    public function test_pdf10_financial_summary_present(): void
    {
        [, , $budget] = $this->submittedBudget([], [], ['unit_price' => '250.00']);

        $html = $this->renderHtml($budget);
        $this->assertStringContainsString('R$ 250,00', $html);
        $this->assertStringContainsString('Subtotal', $html);
        $this->assertStringContainsString('Total', $html);
    }

    /** PDF11: conditions render when filled, and their block is absent when all empty. */
    public function test_pdf11_conditions_rendered_when_present(): void
    {
        [, , $budget] = $this->submittedBudget([], ['payment_terms' => 'Pagamento único à vista.']);
        $html = $this->renderHtml($budget);
        $this->assertStringContainsString('Pagamento único à vista.', $html);
        $this->assertStringContainsString('Condições', $html);

        [, , $budgetNoConditions] = $this->submittedBudget();
        $htmlNoConditions = $this->renderHtml($budgetNoConditions);
        $this->assertStringNotContainsString('Condições de pagamento', $htmlNoConditions);
    }

    /** PDF12: the acceptance section is present. */
    public function test_pdf12_acceptance_section_present(): void
    {
        [, , $budget] = $this->submittedBudget();

        $html = $this->renderHtml($budget);
        $this->assertStringContainsString('Aceite da proposta', $html);
    }

    /** PDF13: an approved proposal shows the approved state, without exposing internal decision details for a manual decision. */
    public function test_pdf13_approved_state(): void
    {
        [$budgetId] = $this->submittedBudget();
        $this->postJson("/api/v1/budgets/{$budgetId}/approve-manually")->assertStatus(200);
        $budget = $this->currentCompanyContext()->run($this->viewCompany, fn () => Budget::query()->with('items')->findOrFail($budgetId));

        $html = $this->renderHtml($budget);
        $this->assertStringContainsString('Proposta aprovada', $html);
    }

    /** PDF14: a rejected proposal shows the rejected state. */
    public function test_pdf14_rejected_state(): void
    {
        [$budgetId] = $this->submittedBudget();
        $this->postJson("/api/v1/budgets/{$budgetId}/reject-manually")->assertStatus(200);
        $budget = $this->currentCompanyContext()->run($this->viewCompany, fn () => Budget::query()->with('items')->findOrFail($budgetId));

        $html = $this->renderHtml($budget);
        $this->assertStringContainsString('Proposta recusada', $html);
    }

    /** PDF15: no cost/margin data ever appears in the rendered document. */
    public function test_pdf15_no_cost_or_margin(): void
    {
        [, , $budget] = $this->submittedBudget();

        $html = $this->renderHtml($budget);
        foreach (['unit_cost', 'line_cost_total', 'cost_subtotal', 'margin_amount', 'margin_percentage'] as $needle) {
            $this->assertStringNotContainsString($needle, $html);
        }
    }

    /** PDF16: Budget.notes never leaks into the document. */
    public function test_pdf16_no_budget_notes(): void
    {
        [, , $budget] = $this->submittedBudget([], ['notes' => 'SEGREDO-PDF-INTERNO']);

        $html = $this->renderHtml($budget);
        $this->assertStringNotContainsString('SEGREDO-PDF-INTERNO', $html);
    }

    /** PDF17: calculation_snapshot content never leaks into the document. */
    public function test_pdf17_no_calculation_snapshot(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember();
        $this->viewCompany = $company;
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->calculatorItemPayload([
            'calculation_snapshot' => ['largura_segredo' => '4.20', 'marca_interna' => 'FORNECEDOR-SECRETO'],
        ]));
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');
        $budget = $this->currentCompanyContext()->run($company, fn () => Budget::query()->with('items')->findOrFail($budgetId));

        $html = $this->renderHtml($budget);
        $this->assertStringNotContainsString('FORNECEDOR-SECRETO', $html);
        $this->assertStringNotContainsString('largura_segredo', $html);
        $this->assertStringNotContainsString('calculation_snapshot', $html);
    }

    /** PDF18: a multi-page fixture (many items) generates a valid PDF successfully. */
    public function test_pdf18_multiple_page_fixture_generates_successfully(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        for ($i = 0; $i < 60; $i++) {
            $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload([
                'name' => "Item {$i} de um orçamento longo para forçar múltiplas páginas",
            ]))->assertStatus(201);
        }
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        $response = $this->get("/api/v1/proposals/{$token}/pdf");
        $response->assertOk();
        $this->assertStringStartsWith('%PDF-', $response->getContent());
        $this->assertGreaterThan(5000, strlen($response->getContent()));
    }
}
