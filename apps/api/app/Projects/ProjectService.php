<?php

namespace App\Projects;

use App\Enums\BudgetStatus;
use App\Enums\ProjectStatus;
use App\Models\Budget;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\Project;
use App\Projects\Exceptions\ProjectConcurrencyConflictException;
use App\Support\CurrentCompanyContext;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * PROJECT-API-01 §39-40. The single place a Project header is created/
 * updated — controllers stay thin. `create()` is one atomic transaction:
 * number allocation, customer/address/source-budget resolution, and the
 * insert all succeed or all roll back together (including the sequence
 * increment — see ProjectNumberAllocator's docblock).
 *
 * `update()` locks the row first (ProjectLocker, real `SELECT ... FOR
 * UPDATE`) and compares the client-supplied `updated_at` precondition
 * against the LOCKED row's real value before anything else — this is
 * what makes the optimistic-concurrency check race-safe (§38).
 *
 * PROJECT-API-01A §1-2/§7/§13-15: the domain invariant "whenever
 * source_budget_id is set, that Budget belongs to the active Company, is
 * approved, and its customer_id equals the Project's customer_id" is
 * enforced HERE, not only in StoreProjectRequest/UpdateProjectRequest.
 * FormRequest validation stays for fast feedback, but this Service is the
 * real domain boundary — a direct call (from a future internal caller,
 * a console command, a test) gets the exact same guarantee an HTTP
 * request does. Every lookup goes through the tenant-scoped Budget model
 * (CompanyScope via BelongsToCompany), so a cross-tenant id and a
 * genuinely nonexistent id fail identically, same discipline as
 * ValidatesProjectRelations.
 */
class ProjectService
{
    public function __construct(
        private readonly ProjectNumberAllocator $numberAllocator,
        private readonly ProjectLocker $locker,
    ) {}

    /**
     * @param  array<string, mixed>  $validated
     */
    public function create(array $validated): Project
    {
        return DB::transaction(function () use ($validated) {
            $companyId = app(CurrentCompanyContext::class)->id();

            $customer = Customer::query()->findOrFail($validated['customer_id']);

            $customerAddressId = $validated['customer_address_id'] ?? null;
            $customerAddress = $customerAddressId !== null
                ? CustomerAddress::query()->where('customer_id', $customer->id)->findOrFail($customerAddressId)
                : null;

            // §18/SBI8: validated BEFORE the number allocator runs — a
            // rejected source_budget_id must never burn a sequence number.
            $sourceBudgetId = $validated['source_budget_id'] ?? null;
            $this->assertSourceBudgetInvariant($sourceBudgetId, $customer->id);

            if (array_key_exists('address', $validated)) {
                // §24: an explicitly-sent address always wins, even when a
                // customer_address_id was also sent (the source reference
                // is kept, but the stored snapshot is the explicit one).
                $addressFields = $this->addressFieldsFromInput($validated['address']);
            } elseif ($customerAddress !== null) {
                // §23: origin selected, no explicit override -> copy.
                $addressFields = $this->addressFieldsFromCustomerAddress($customerAddress);
            } else {
                // §25/§26: manual/no address at all.
                $addressFields = $this->emptyAddressFields();
            }

            $number = $this->numberAllocator->allocate($companyId);

            $project = Project::create(array_merge(
                [
                    'number' => $number,
                    'status' => ProjectStatus::Planning,
                    'name' => $validated['name'],
                    'reference' => $validated['reference'] ?? null,
                    'customer_id' => $customer->id,
                    'customer_address_id' => $customerAddress?->id,
                    'expected_start_date' => $validated['expected_start_date'] ?? null,
                    'expected_end_date' => $validated['expected_end_date'] ?? null,
                    'source_budget_id' => $sourceBudgetId,
                ],
                $addressFields
            ));

            return $project->fresh(['customer', 'sourceBudget']);
        });
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    public function update(Project|string $project, array $validated): Project
    {
        return DB::transaction(function () use ($project, $validated) {
            $locked = $this->locker->lock($project);

            $this->assertNotStale($locked, $validated['updated_at']);

            $customerChanged = array_key_exists('customer_id', $validated) && $validated['customer_id'] !== $locked->customer_id;
            $targetCustomerId = $customerChanged ? $validated['customer_id'] : $locked->customer_id;

            // §8/§13-14: re-checked against the LOCKED row's own
            // source_budget_id, inside the same transaction — never
            // trusts that UpdateProjectRequest already caught this.
            $this->assertSourceBudgetCustomerCoherence($locked, $targetCustomerId);

            $customer = Customer::query()->findOrFail($targetCustomerId);

            [$resolvedCustomerAddressId, $addressFields] = $this->resolveUpdateAddress($locked, $customer, $customerChanged, $validated);

            $attrs = array_merge(
                array_intersect_key($validated, array_flip(['name', 'reference', 'status', 'expected_start_date', 'expected_end_date'])),
                [
                    'customer_id' => $customer->id,
                    'customer_address_id' => $resolvedCustomerAddressId,
                ],
                $addressFields
            );

            $locked->fill($attrs);
            $locked->save();

            return $locked->fresh(['customer', 'sourceBudget']);
        });
    }

    /**
     * PROJECT-API-01A §1-2/§18. Domain-level defense — repeats what
     * StoreProjectRequest already validates, but as the real boundary a
     * direct Service call (not only HTTP) must also go through.
     */
    private function assertSourceBudgetInvariant(?string $sourceBudgetId, string $customerId): void
    {
        if ($sourceBudgetId === null) {
            return;
        }

        // Tenant-scoped via CompanyScope — a cross-Company id and a
        // genuinely nonexistent id fail identically here.
        $budget = Budget::query()->find($sourceBudgetId);

        if ($budget === null) {
            throw ValidationException::withMessages(['source_budget_id' => 'Orçamento inválido.']);
        }

        if ($budget->status !== BudgetStatus::Approved) {
            throw ValidationException::withMessages(['source_budget_id' => 'Este orçamento não está aprovado.']);
        }

        if ($budget->customer_id !== $customerId) {
            throw ValidationException::withMessages(['source_budget_id' => 'O orçamento selecionado pertence a outro cliente.']);
        }
    }

    /**
     * PROJECT-API-01A §8/§13-15. Whenever the LOCKED Project has a
     * source_budget_id, the target customer_id of this update must stay
     * exactly sourceBudget.customer_id — source_budget_id itself is
     * immutable (prohibited in UpdateProjectRequest), so this is the only
     * way the §1 invariant could otherwise be broken after creation.
     */
    private function assertSourceBudgetCustomerCoherence(Project $locked, string $targetCustomerId): void
    {
        if ($locked->source_budget_id === null) {
            return;
        }

        $budget = Budget::query()->find($locked->source_budget_id);

        if ($budget?->customer_id !== $targetCustomerId) {
            throw ValidationException::withMessages([
                'customer_id' => 'Não é possível alterar o cliente desta obra porque ela foi criada a partir de um orçamento de outro cliente.',
            ]);
        }
    }

    private function assertNotStale(Project $locked, string $providedUpdatedAt): void
    {
        $provided = Carbon::parse($providedUpdatedAt);

        if ($locked->updated_at === null || ! $locked->updated_at->equalTo($provided)) {
            throw new ProjectConcurrencyConflictException(
                'A obra foi alterada por outra pessoa. Recarregue os dados e tente novamente.'
            );
        }
    }

    /**
     * §20/§22/§24/§28-30: resolves both the `customer_address_id`
     * reference and the actual stored `address_*` snapshot together,
     * since a customer_address_id change and an explicit address in the
     * same request interact (explicit address always wins over a fresh
     * copy from the newly-selected source).
     *
     * @param  array<string, mixed>  $validated
     * @return array{0: ?string, 1: array<string, mixed>}
     */
    private function resolveUpdateAddress(Project $locked, Customer $customer, bool $customerChanged, array $validated): array
    {
        $customerAddressIdKeyPresent = array_key_exists('customer_address_id', $validated);
        $addressKeyPresent = array_key_exists('address', $validated);

        // §30: if the customer changed and the CURRENT customer_address_id
        // no longer belongs to the new customer, detach it — but this
        // request's own customer_address_id (if any) still takes
        // precedence below. The physical address_* snapshot is never
        // cleared by this detach alone.
        $baseCustomerAddressId = $locked->customer_address_id;
        if ($customerChanged && $baseCustomerAddressId !== null && ! $customerAddressIdKeyPresent) {
            $stillBelongs = CustomerAddress::query()->where('customer_id', $customer->id)->whereKey($baseCustomerAddressId)->exists();
            if (! $stillBelongs) {
                $baseCustomerAddressId = null;
            }
        }

        $copiedFromNewSource = null;
        if ($customerAddressIdKeyPresent) {
            $newCustomerAddressId = $validated['customer_address_id'];
            if ($newCustomerAddressId === null) {
                // §29: desassociar apenas — preserva o endereço físico atual.
                $resolvedCustomerAddressId = null;
            } else {
                $customerAddress = CustomerAddress::query()->where('customer_id', $customer->id)->findOrFail($newCustomerAddressId);
                $resolvedCustomerAddressId = $customerAddress->id;
                $copiedFromNewSource = $this->addressFieldsFromCustomerAddress($customerAddress);
            }
        } else {
            $resolvedCustomerAddressId = $baseCustomerAddressId;
        }

        if ($addressKeyPresent) {
            // §24/§28: explicit address always wins, replacing whatever
            // the snapshot would otherwise have been.
            $addressFields = $this->addressFieldsFromInput($validated['address']);
        } elseif ($copiedFromNewSource !== null) {
            // §29: new source selected, no explicit override -> copy.
            $addressFields = $copiedFromNewSource;
        } else {
            // §29/§30: nothing about the address snapshot itself was
            // touched -> preserve exactly what's already stored.
            $addressFields = $this->currentAddressFields($locked);
        }

        return [$resolvedCustomerAddressId, $addressFields];
    }

    /**
     * @param  array<string, mixed>|null  $address
     * @return array<string, mixed>
     */
    private function addressFieldsFromInput(?array $address): array
    {
        if ($address === null) {
            return $this->emptyAddressFields();
        }

        return [
            'address_postal_code' => $address['postal_code'] ?? null,
            'address_street' => $address['street'] ?? null,
            'address_number' => $address['number'] ?? null,
            'address_complement' => $address['complement'] ?? null,
            'address_neighborhood' => $address['neighborhood'] ?? null,
            'address_city' => $address['city'] ?? null,
            'address_state' => $address['state'] ?? null,
            'address_reference_point' => $address['reference_point'] ?? null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function addressFieldsFromCustomerAddress(CustomerAddress $address): array
    {
        return [
            'address_postal_code' => $address->postal_code,
            'address_street' => $address->street,
            'address_number' => $address->number,
            'address_complement' => $address->complement,
            'address_neighborhood' => $address->neighborhood,
            'address_city' => $address->city,
            'address_state' => $address->state,
            'address_reference_point' => $address->reference_point,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function currentAddressFields(Project $project): array
    {
        return [
            'address_postal_code' => $project->address_postal_code,
            'address_street' => $project->address_street,
            'address_number' => $project->address_number,
            'address_complement' => $project->address_complement,
            'address_neighborhood' => $project->address_neighborhood,
            'address_city' => $project->address_city,
            'address_state' => $project->address_state,
            'address_reference_point' => $project->address_reference_point,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function emptyAddressFields(): array
    {
        return [
            'address_postal_code' => null,
            'address_street' => null,
            'address_number' => null,
            'address_complement' => null,
            'address_neighborhood' => null,
            'address_city' => null,
            'address_state' => null,
            'address_reference_point' => null,
        ];
    }
}
