<?php

namespace App\Customers;

use App\Models\Customer;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The single place Customer rows are created/updated (§51 — "controller
 * fino"). create() is the one entry point both the future Clientes module
 * and the future "novo cliente" flow inside a Service Order will use
 * (§39/§92-93) — a customer created from either place is the exact same
 * real Customer row, never a parallel shape.
 *
 * BACKEND-04B: StoreCustomerRequest/UpdateCustomerRequest already
 * pre-check document uniqueness for a fast, friendly response in the
 * common case — but that check and the actual insert/update are two
 * separate statements, so two concurrent requests can both pass
 * validation for the same (company_id, document) before either commits.
 * PostgreSQL's real partial unique index
 * (customers_company_document_unique) remains the sole authority; this
 * class is what turns that constraint's rejection into the same
 * ValidationException shape the pre-check already produces, instead of a
 * raw 500.
 */
class CustomerService
{
    private const string DOCUMENT_UNIQUE_CONSTRAINT = 'customers_company_document_unique';

    /**
     * @param  array<string, mixed>  $validated
     */
    public function create(array $validated): Customer
    {
        return DB::transaction(function () use ($validated) {
            $customer = $this->insertCustomer([
                'kind' => $validated['kind'],
                'name' => $validated['name'],
                'legal_name' => $validated['legal_name'] ?? null,
                'trade_name' => $validated['trade_name'] ?? null,
                'document' => $validated['document'] ?? null,
                'phone' => $validated['phone'] ?? null,
                'email' => $validated['email'] ?? null,
                'notes' => $validated['notes'] ?? null,
                'active' => $validated['active'] ?? true,
            ]);

            $addresses = $validated['addresses'] ?? [];
            if ($addresses !== []) {
                $addressService = new CustomerAddressService;
                foreach ($addresses as $address) {
                    $addressService->create($customer, $address);
                }
            }

            $contacts = $validated['contacts'] ?? [];
            if ($contacts !== []) {
                $contactService = new CustomerContactService;
                foreach ($contacts as $contact) {
                    $contactService->create($customer, $contact);
                }
            }

            return $customer->fresh(['addresses', 'contacts']);
        });
    }

    /**
     * §38: only Customer's own fields — addresses/contacts are never
     * synced/deleted here, they have their own endpoints.
     *
     * @param  array<string, mixed>  $validated
     */
    public function update(Customer $customer, array $validated): Customer
    {
        $customer->fill([
            'kind' => $validated['kind'],
            'name' => $validated['name'],
            'legal_name' => $validated['legal_name'] ?? null,
            'trade_name' => $validated['trade_name'] ?? null,
            'document' => $validated['document'] ?? null,
            'phone' => $validated['phone'] ?? null,
            'email' => $validated['email'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'active' => $validated['active'] ?? $customer->active,
        ]);

        $this->saveOrConvertDocumentConflict($customer);

        return $customer;
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function insertCustomer(array $attributes): Customer
    {
        try {
            return Customer::create($attributes);
        } catch (QueryException $e) {
            $this->rethrowAsValidationIfDocumentConflict($e);

            throw $e;
        }
    }

    /**
     * A nested DB::transaction() here becomes a real Postgres SAVEPOINT
     * when called from within an already-open transaction (the normal
     * case: the request's own transaction, or — in tests — RefreshDatabase's
     * wrapping transaction). Without it, catching the QueryException below
     * would still leave the *outer* transaction poisoned (Postgres aborts
     * the whole transaction on any statement error until a real
     * ROLLBACK/ROLLBACK TO SAVEPOINT), breaking every query after this
     * method returns — the same fix already established for
     * NotificationDispatcher::createEventOrNull() (BACKEND-03).
     */
    private function saveOrConvertDocumentConflict(Customer $customer): void
    {
        try {
            DB::transaction(fn () => $customer->save());
        } catch (QueryException $e) {
            $this->rethrowAsValidationIfDocumentConflict($e);

            throw $e;
        }
    }

    /**
     * Only ever converts the one specific, known conflict this class is
     * responsible for (§5 — "não engolir outros erros"). Every other
     * QueryException — connection failure, schema mismatch, a *different*
     * constraint (FK, CHECK, the address/contact primary index, ...) — is
     * deliberately re-thrown unchanged and surfaces as the real failure it
     * is, never silently reinterpreted as a validation problem.
     *
     * PostgreSQL/PDO don't hand Laravel a structured constraint name —
     * `getCode()` gives the SQLSTATE (23505 = unique_violation), and the
     * constraint name only appears embedded in the driver error message
     * text. Checking both is the same strategy already established by
     * NotificationDispatcher::isUniqueViolation() (BACKEND-03).
     */
    private function rethrowAsValidationIfDocumentConflict(QueryException $e): void
    {
        if ($e->getCode() !== '23505') {
            return;
        }

        if (! str_contains($e->getMessage(), self::DOCUMENT_UNIQUE_CONSTRAINT)) {
            return;
        }

        throw ValidationException::withMessages([
            'document' => 'Já existe um cliente com este CPF/CNPJ.',
        ]);
    }
}
