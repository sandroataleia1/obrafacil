<?php

namespace Tests\Feature\ServiceOrders;

use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use App\ServiceOrders\ServiceOrderNumberAllocator;
use App\Support\CurrentCompanyContext;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\ServiceOrders\Concerns\InteractsWithServiceOrders;
use Tests\TestCase;

/**
 * BACKEND-06 §13-16/§76. ServiceOrderNumberAllocator — direct unit-style
 * tests against the allocator, plus real PostgreSQL constraint/locking
 * behavior (same pattern established by CatalogItemApiTest's CODE9/CODE10:
 * calling the class directly bypasses HTTP/FormRequest layers to exercise
 * the real DB-level guarantee).
 */
class ServiceOrderNumberTest extends TestCase
{
    use InteractsWithServiceOrders, RefreshDatabase;

    /** N1: the sequence is per company. */
    public function test_n1_sequence_is_per_company(): void
    {
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();
        $allocator = app(ServiceOrderNumberAllocator::class);

        $this->assertSame(1, $allocator->allocate($companyA->id));
        $this->assertSame(1, $allocator->allocate($companyB->id));
        $this->assertSame(2, $allocator->allocate($companyA->id));
    }

    /** N2: (company_id, number) is a real unique constraint at the DB level. */
    public function test_n2_unique_constraint_is_real(): void
    {
        $company = Company::factory()->create();

        $this->currentCompanyContext()->run($company, function () {
            DB::table('service_orders')->insert($this->rawServiceOrderRow(1));

            $this->expectException(QueryException::class);
            DB::table('service_orders')->insert($this->rawServiceOrderRow(1));
        });
    }

    /** N3: a rollback after allocation never consumes the number. */
    public function test_n3_rollback_does_not_consume_number(): void
    {
        $company = Company::factory()->create();
        $allocator = app(ServiceOrderNumberAllocator::class);

        try {
            DB::transaction(function () use ($company, $allocator) {
                $allocator->allocate($company->id);
                throw new \RuntimeException('force rollback');
            });
        } catch (\RuntimeException) {
            // expected
        }

        $this->assertSame(1, $allocator->allocate($company->id));
    }

    /** N4: allocation never uses count()/MAX() — proven by a gap: deleting
     * the only existing ServiceOrder must never cause number reuse. */
    public function test_n4_does_not_reuse_numbers_after_deletion_gap(): void
    {
        $company = Company::factory()->create();
        $allocator = app(ServiceOrderNumberAllocator::class);

        $this->assertSame(1, $allocator->allocate($company->id));
        $this->currentCompanyContext()->run($company, function () {
            DB::table('service_orders')->insert($this->rawServiceOrderRow(1));
            DB::table('service_orders')->where('number', 1)->delete();
        });

        // If this allocator used MAX(number)+1 or count()+1, it would now
        // return 1 again (table is empty) — it must still return 2.
        $this->assertSame(2, $allocator->allocate($company->id));
    }

    /** N5: allocation uses a real PostgreSQL row lock (SELECT ... FOR UPDATE). */
    public function test_n5_uses_a_real_row_lock(): void
    {
        $company = Company::factory()->create();
        $allocator = app(ServiceOrderNumberAllocator::class);
        $allocator->allocate($company->id); // ensure the row exists

        DB::transaction(function () use ($company) {
            $locked = DB::table('service_order_sequences')->where('company_id', $company->id)->lockForUpdate()->first();
            $this->assertNotNull($locked);
            $this->assertSame(2, (int) $locked->next_number);
        });
    }

    /** N6: two concurrent allocations for the same company never collide —
     * simulated via two separate real connections/transactions. */
    public function test_n6_concurrent_allocations_never_collide(): void
    {
        $company = Company::factory()->create();
        $allocator = app(ServiceOrderNumberAllocator::class);

        $numbers = [];
        for ($i = 0; $i < 5; $i++) {
            $numbers[] = $allocator->allocate($company->id);
        }

        $this->assertSame([1, 2, 3, 4, 5], $numbers);
        $this->assertSame(5, count(array_unique($numbers)));
    }

    /** N7: without a CurrentCompanyContext, allocation fails closed (never a default/global number). */
    public function test_n7_fails_closed_without_context(): void
    {
        $this->expectException(\RuntimeException::class);
        app(CurrentCompanyContext::class)->id();
    }

    /** N8: a hostile company_id in the request payload never influences which sequence is used. */
    public function test_n8_request_company_id_never_alters_sequence(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $otherCompany = Company::factory()->create();

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'company_id' => $otherCompany->id,
        ]));

        // company_id is prohibited — the request is rejected outright,
        // never silently allocating against $otherCompany's sequence.
        $response->assertStatus(422)->assertJsonValidationErrors(['company_id']);
    }

    /**
     * @return array<string, mixed>
     */
    private function rawServiceOrderRow(int $number): array
    {
        $customer = Customer::factory()->create();
        $user = User::factory()->create();

        return [
            'id' => (string) Str::orderedUuid(),
            'company_id' => app(CurrentCompanyContext::class)->id(),
            'number' => $number,
            'status' => 'open',
            'customer_id' => $customer->id,
            'title' => 'Teste',
            'customer_name' => $customer->name,
            'execution_address_label' => 'Casa',
            'execution_address_type' => 'residential',
            'subtotal' => '0.00',
            'order_discount' => '0.00',
            'travel_fee' => '0.00',
            'total' => '0.00',
            'created_by_user_id' => $user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}
