<?php

namespace Database\Factories;

use App\Enums\BudgetStatus;
use App\Models\Budget;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Budget>
 *
 * company_id is never set here (BelongsToCompany's creating hook derives
 * it from CurrentCompanyContext). Deliberately does NOT go through
 * BudgetNumberAllocator — `number` here is just a fake unique value,
 * never authoritative sequencing behavior (tested separately via the
 * HTTP API).
 */
class BudgetFactory extends Factory
{
    protected $model = Budget::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $customer = Customer::factory()->create();
        $user = User::factory()->create();

        return [
            'number' => fake()->unique()->numberBetween(1, 999999),
            'status' => BudgetStatus::Draft,
            'customer_id' => $customer->id,
            'title' => fake()->sentence(3),
            'reference' => null,
            'notes' => null,
            'customer_name' => $customer->name,
            'customer_document' => $customer->document,
            'customer_phone' => $customer->phone,
            'customer_email' => $customer->email,
            'sale_subtotal' => '0.00',
            'cost_subtotal' => null,
            'margin_amount' => null,
            'margin_percentage' => null,
            'discount_amount' => '0.00',
            'total' => '0.00',
            'proposal_token' => null,
            'submitted_at' => null,
            'created_by_user_id' => $user->id,
        ];
    }

    public function pendingApproval(): static
    {
        return $this->state(fn () => [
            'status' => BudgetStatus::PendingApproval,
            'submitted_at' => now(),
            'proposal_token' => bin2hex(random_bytes(24)),
        ]);
    }

    public function approved(): static
    {
        return $this->state(fn () => [
            'status' => BudgetStatus::Approved,
            'submitted_at' => now(),
            'decided_at' => now(),
            'proposal_token' => bin2hex(random_bytes(24)),
        ]);
    }

    public function rejected(): static
    {
        return $this->state(fn () => [
            'status' => BudgetStatus::Rejected,
            'submitted_at' => now(),
            'decided_at' => now(),
            'proposal_token' => bin2hex(random_bytes(24)),
        ]);
    }
}
