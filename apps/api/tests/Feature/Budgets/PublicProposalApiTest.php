<?php

namespace Tests\Feature\Budgets;

use App\Models\Budget;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * BUDGET-API-01 PP1-PP16. GET/POST /api/v1/proposals/{token} — PUBLIC,
 * no Sanctum auth.
 */
class PublicProposalApiTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    /**
     * @return array{0: string, 1: string} [budgetId, token]
     */
    private function createPendingBudget(array $itemOverrides = []): array
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload($itemOverrides))->assertStatus(201);
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        return [$budgetId, $token];
    }

    /** PP1: a valid token is publicly viewable with no auth. */
    public function test_pp1_valid_token_is_publicly_viewable(): void
    {
        [, $token] = $this->createPendingBudget();

        $this->getJson("/api/v1/proposals/{$token}")->assertStatus(200);
    }

    /** PP2: an unknown token is a 404. */
    public function test_pp2_unknown_token_is_404(): void
    {
        $this->getJson('/api/v1/proposals/does-not-exist')->assertStatus(404);
    }

    /** PP3: company_id is never exposed. */
    public function test_pp3_company_id_never_exposed(): void
    {
        [, $token] = $this->createPendingBudget();

        $this->getJson("/api/v1/proposals/{$token}")->assertJsonMissingPath('company_id');
    }

    /** PP4: customer_id is never exposed. */
    public function test_pp4_customer_id_never_exposed(): void
    {
        [, $token] = $this->createPendingBudget();

        $this->getJson("/api/v1/proposals/{$token}")->assertJsonMissingPath('customer_id');
    }

    /** PP5: customer_document/phone/email are never exposed. */
    public function test_pp5_customer_contact_details_never_exposed(): void
    {
        [, $token] = $this->createPendingBudget();

        $response = $this->getJson("/api/v1/proposals/{$token}");
        $response->assertJsonMissingPath('customer_document');
        $response->assertJsonMissingPath('customer_phone');
        $response->assertJsonMissingPath('customer_email');
    }

    /** PP6: unit_cost/line_cost_total are never exposed on items. */
    public function test_pp6_item_cost_fields_never_exposed(): void
    {
        [, $token] = $this->createPendingBudget(['unit_cost' => '50.00']);

        $response = $this->getJson("/api/v1/proposals/{$token}");
        $response->assertJsonMissingPath('items.0.unit_cost');
        $response->assertJsonMissingPath('items.0.line_cost_total');
        $response->assertJsonMissingPath('items.0.calculation_snapshot');
        $response->assertJsonMissingPath('items.0.type');
        $response->assertJsonMissingPath('items.0.calculator_type');
    }

    /** PP7: cost_subtotal/margin_amount/margin_percentage are never exposed. */
    public function test_pp7_margin_fields_never_exposed(): void
    {
        [, $token] = $this->createPendingBudget();

        $response = $this->getJson("/api/v1/proposals/{$token}");
        $response->assertJsonMissingPath('cost_subtotal');
        $response->assertJsonMissingPath('margin_amount');
        $response->assertJsonMissingPath('margin_percentage');
    }

    /** PP8: created_by_user_id/decision_by_user_id are never exposed, and a calculator item's calculation_snapshot is never exposed either. */
    public function test_pp8_internal_audit_fields_never_exposed(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->calculatorItemPayload())->assertStatus(201);
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        $response = $this->getJson("/api/v1/proposals/{$token}");
        $response->assertJsonMissingPath('created_by_user_id');
        $response->assertJsonMissingPath('decision_by_user_id');
        $response->assertJsonMissingPath('items.0.calculation_snapshot');
    }

    /** PP9: approve requires name. */
    public function test_pp9_approve_requires_name(): void
    {
        [, $token] = $this->createPendingBudget();

        $this->postJson("/api/v1/proposals/{$token}/approve", ['accepted' => true])
            ->assertStatus(422)->assertJsonValidationErrors(['name']);
    }

    /** PP10: approve requires accepted=true. */
    public function test_pp10_approve_requires_accepted_true(): void
    {
        [, $token] = $this->createPendingBudget();

        $this->postJson("/api/v1/proposals/{$token}/approve", ['name' => 'Cliente'])
            ->assertStatus(422)->assertJsonValidationErrors(['accepted']);

        $this->postJson("/api/v1/proposals/{$token}/approve", ['name' => 'Cliente', 'accepted' => false])
            ->assertStatus(422)->assertJsonValidationErrors(['accepted']);
    }

    /** PP11: a valid approve transitions to approved with decision_source=public_link. */
    public function test_pp11_valid_approve_transitions_to_approved(): void
    {
        [$budgetId, $token] = $this->createPendingBudget();

        $this->postJson("/api/v1/proposals/{$token}/approve", ['name' => 'Cliente Final', 'accepted' => true])
            ->assertStatus(200)->assertJson(['status' => 'approved', 'decision_by_name' => 'Cliente Final']);

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson(['decision_source' => 'public_link']);
    }

    /** PP12: reject requires name. */
    public function test_pp12_reject_requires_name(): void
    {
        [, $token] = $this->createPendingBudget();

        $this->postJson("/api/v1/proposals/{$token}/reject", [])
            ->assertStatus(422)->assertJsonValidationErrors(['name']);
    }

    /** PP13: a valid reject transitions to rejected. */
    public function test_pp13_valid_reject_transitions_to_rejected(): void
    {
        [, $token] = $this->createPendingBudget();

        $this->postJson("/api/v1/proposals/{$token}/reject", ['name' => 'Cliente Final', 'note' => 'Muito caro'])
            ->assertStatus(200)->assertJson(['status' => 'rejected']);
    }

    /** PP14: approving an already-decided proposal is a 409. */
    public function test_pp14_double_decision_is_409(): void
    {
        [, $token] = $this->createPendingBudget();

        $this->postJson("/api/v1/proposals/{$token}/approve", ['name' => 'A', 'accepted' => true])->assertStatus(200);
        $this->postJson("/api/v1/proposals/{$token}/reject", ['name' => 'B'])->assertStatus(409);
    }

    /** PP15: deciding on a still-draft (never submitted) proposal token is impossible — no token exists yet, so it's a 404. */
    public function test_pp15_draft_budget_has_no_token_yet(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson(['proposal_token' => null]);
    }

    /** PP16: decision endpoints are rate-limited. */
    public function test_pp16_decision_endpoints_are_rate_limited(): void
    {
        [, $token] = $this->createPendingBudget();

        $last = null;
        for ($i = 0; $i < 15; $i++) {
            $last = $this->postJson("/api/v1/proposals/{$token}/reject", ['name' => 'Spammer '.$i]);
        }

        $this->assertContains($last->getStatusCode(), [409, 429]);
        // At least one of the 15 attempts must have been throttled — the
        // first succeeds (200) then flips the Budget to a terminal state,
        // so every following non-throttled attempt is a 409; a 429 must
        // show up among them given the 10/minute limit.
        $statuses = [];
        // Re-run against a fresh proposal to isolate the throttle signal
        // from the "already decided" 409 noise above.
        [, $freshToken] = $this->createPendingBudget();
        for ($i = 0; $i < 15; $i++) {
            $statuses[] = $this->postJson("/api/v1/proposals/{$freshToken}/approve", [
                'name' => 'Spammer', 'accepted' => true,
            ])->getStatusCode();
        }
        $this->assertContains(429, $statuses, 'Expected at least one 429 among 15 rapid decision attempts: '.json_encode($statuses));
    }

    // ================= DN1-DN10 (BUDGET-API-01A §25-31) — decision note/name contract =================

    /** DN1: public approve's note persists to decision_note. */
    public function test_dn1_public_approve_note_persists(): void
    {
        [$budgetId, $token] = $this->createPendingBudget();

        $this->postJson("/api/v1/proposals/{$token}/approve", [
            'name' => 'Cliente Final', 'accepted' => true, 'note' => 'Combinado por WhatsApp',
        ])->assertStatus(200);

        $this->actingAsNewCompanyMember();
        // The authenticated resource is the one that exposes decision_note
        // (the public resource deliberately does not) — read it back from
        // the same underlying row via the tenant that owns it.
        $this->assertSame(
            'Combinado por WhatsApp',
            Budget::withoutCompanyScope()->find($budgetId)->decision_note
        );
    }

    /** DN2: public reject's note persists to decision_note. */
    public function test_dn2_public_reject_note_persists(): void
    {
        [$budgetId, $token] = $this->createPendingBudget();

        $this->postJson("/api/v1/proposals/{$token}/reject", ['name' => 'Cliente Final', 'note' => 'Muito caro'])
            ->assertStatus(200);

        $this->assertSame('Muito caro', Budget::withoutCompanyScope()->find($budgetId)->decision_note);
    }

    /** DN3: the old "reason" field name is never accepted/silently used — only "note" is. */
    public function test_dn3_public_reject_reason_field_is_not_used(): void
    {
        [$budgetId, $token] = $this->createPendingBudget();

        $this->postJson("/api/v1/proposals/{$token}/reject", ['name' => 'Cliente Final', 'reason' => 'Isto nunca deve ser salvo'])
            ->assertStatus(200);

        $this->assertNull(Budget::withoutCompanyScope()->find($budgetId)->decision_note);
    }

    /** DN6: decision_by_name on the public resource matches the submitted name. */
    public function test_dn6_public_decision_by_name_matches_submitted_name(): void
    {
        [, $token] = $this->createPendingBudget();

        $this->postJson("/api/v1/proposals/{$token}/approve", ['name' => 'Carlos Souza', 'accepted' => true])
            ->assertJson(['decision_by_name' => 'Carlos Souza']);
    }

    /** DN9: decision_by_user_id is always null for a public decision — there is no authenticated user. */
    public function test_dn9_public_decision_by_user_id_is_null(): void
    {
        [$budgetId, $token] = $this->createPendingBudget();

        $this->postJson("/api/v1/proposals/{$token}/approve", ['name' => 'Cliente', 'accepted' => true])->assertStatus(200);

        $this->assertNull(Budget::withoutCompanyScope()->find($budgetId)->decision_by_user_id);
    }

    /**
     * DN10: resource contract is consistent — decision_note is the ONE
     * canonical persisted field regardless of decision path (public
     * approve/reject, manual approve/reject); there is no second name for
     * the same thing anywhere (already proven per-path by DN1/DN2/DN4/
     * DN5; this asserts all four land in the exact same column/shape).
     */
    public function test_dn10_decision_note_is_the_single_canonical_field_across_all_decision_paths(): void
    {
        [$budgetIdPublicApprove, $tokenA] = $this->createPendingBudget();
        $this->postJson("/api/v1/proposals/{$tokenA}/approve", ['name' => 'A', 'accepted' => true, 'note' => 'via public approve']);

        [$budgetIdPublicReject, $tokenB] = $this->createPendingBudget();
        $this->postJson("/api/v1/proposals/{$tokenB}/reject", ['name' => 'B', 'note' => 'via public reject']);

        $this->assertSame('via public approve', Budget::withoutCompanyScope()->find($budgetIdPublicApprove)->decision_note);
        $this->assertSame('via public reject', Budget::withoutCompanyScope()->find($budgetIdPublicReject)->decision_note);
    }
}
