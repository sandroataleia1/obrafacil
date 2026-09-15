<?php

namespace Tests\Feature\Budgets;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * PROPOSAL-DOC-01A §55: PCO1-PCO10 — valid_until/payment_terms/
 * execution_terms/proposal_terms.
 */
class BudgetConditionsTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    /** PCO1: conditions can be set on create. */
    public function test_pco1_create_conditions(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $response = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'valid_until' => '2026-12-31',
            'payment_terms' => '50% na assinatura, 50% na entrega.',
            'execution_terms' => 'Prazo de 30 dias úteis.',
            'proposal_terms' => 'Proposta válida para o escopo descrito.',
        ]));

        $response->assertStatus(201);
        $response->assertJson([
            'valid_until' => '2026-12-31',
            'payment_terms' => '50% na assinatura, 50% na entrega.',
            'execution_terms' => 'Prazo de 30 dias úteis.',
            'proposal_terms' => 'Proposta válida para o escopo descrito.',
        ]);
    }

    /** PCO2: conditions can be updated while draft. */
    public function test_pco2_update_conditions_while_draft(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');

        $response = $this->putJson("/api/v1/budgets/{$budgetId}", $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'valid_until' => '2026-11-30',
            'payment_terms' => 'À vista.',
        ]));

        $response->assertStatus(200);
        $response->assertJson(['valid_until' => '2026-11-30', 'payment_terms' => 'À vista.']);
    }

    /** PCO3: valid_until accepts a real date and is returned in Y-m-d shape. */
    public function test_pco3_valid_until_date(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $response = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'valid_until' => '2027-01-15',
        ]));

        $response->assertJson(['valid_until' => '2027-01-15']);

        $badResponse = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'valid_until' => 'not-a-date',
        ]));
        $badResponse->assertStatus(422)->assertJsonValidationErrors(['valid_until']);
    }

    /** PCO4: all four condition fields accept null. */
    public function test_pco4_null_allowed(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $response = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'valid_until' => null,
            'payment_terms' => null,
            'execution_terms' => null,
            'proposal_terms' => null,
        ]));

        $response->assertStatus(201);
        $response->assertJson([
            'valid_until' => null,
            'payment_terms' => null,
            'execution_terms' => null,
            'proposal_terms' => null,
        ]);
    }

    /** PCO5: conditions become immutable once pending_approval. */
    public function test_pco5_pending_immutable(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id, 'payment_terms' => 'Original',
        ]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $this->postJson("/api/v1/budgets/{$budgetId}/submit");

        $response = $this->putJson("/api/v1/budgets/{$budgetId}", $this->validBudgetPayload([
            'customer_id' => $customer->id, 'payment_terms' => 'Tentativa de alteração',
        ]));

        $response->assertStatus(409);
        $this->assertSame('Original', $this->getJson("/api/v1/budgets/{$budgetId}")->json('payment_terms'));
    }

    /** PCO6: conditions stay immutable once approved. */
    public function test_pco6_approved_immutable(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id, 'execution_terms' => 'Original',
        ]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $this->postJson("/api/v1/budgets/{$budgetId}/approve-manually")->assertStatus(200);

        $response = $this->putJson("/api/v1/budgets/{$budgetId}", $this->validBudgetPayload([
            'customer_id' => $customer->id, 'execution_terms' => 'Tentativa',
        ]));

        $response->assertStatus(409);
    }

    /** PCO7: conditions stay immutable once rejected. */
    public function test_pco7_rejected_immutable(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id, 'proposal_terms' => 'Original',
        ]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $this->postJson("/api/v1/budgets/{$budgetId}/reject-manually")->assertStatus(200);

        $response = $this->putJson("/api/v1/budgets/{$budgetId}", $this->validBudgetPayload([
            'customer_id' => $customer->id, 'proposal_terms' => 'Tentativa',
        ]));

        $response->assertStatus(409);
    }

    /** PCO8: notes remains internal — never conflated with the public conditions. */
    public function test_pco8_notes_remains_internal(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id, 'notes' => 'Nota interna confidencial',
        ]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $this->postJson("/api/v1/budgets/{$budgetId}/submit");

        $internal = $this->getJson("/api/v1/budgets/{$budgetId}")->json();
        $this->assertSame('Nota interna confidencial', $internal['notes']);

        $public = $this->getJson('/api/v1/proposals/'.$internal['proposal_token'])->json();
        $this->assertArrayNotHasKey('notes', $public);
        $publicBody = json_encode($public);
        $this->assertStringNotContainsString('Nota interna confidencial', $publicBody);
    }

    /** PCO9: the public proposal exposes the condition fields. */
    public function test_pco9_public_exposes_proposal_conditions(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'valid_until' => '2026-12-31',
            'payment_terms' => 'Pagamento em 2x.',
            'execution_terms' => 'Início em até 5 dias.',
            'proposal_terms' => 'Escopo fechado.',
        ]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        $public = $this->getJson("/api/v1/proposals/{$token}")->json();
        $this->assertSame('2026-12-31', $public['valid_until']);
        $this->assertSame('Pagamento em 2x.', $public['payment_terms']);
        $this->assertSame('Início em até 5 dias.', $public['execution_terms']);
        $this->assertSame('Escopo fechado.', $public['proposal_terms']);
    }

    /** PCO10: the public proposal never exposes Budget.notes, regardless of content. */
    public function test_pco10_public_never_exposes_internal_notes(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id, 'notes' => 'SEGREDO-INTERNO-XYZ',
        ]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        $response = $this->getJson("/api/v1/proposals/{$token}");
        $response->assertJsonMissingPath('notes');
        $this->assertStringNotContainsString('SEGREDO-INTERNO-XYZ', $response->getContent());
    }
}
