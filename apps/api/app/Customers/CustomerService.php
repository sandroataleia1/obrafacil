<?php

namespace App\Customers;

use App\Models\Customer;
use Illuminate\Support\Facades\DB;

/**
 * The single place Customer rows are created/updated (§51 — "controller
 * fino"). create() is the one entry point both the future Clientes module
 * and the future "novo cliente" flow inside a Service Order will use
 * (§39/§92-93) — a customer created from either place is the exact same
 * real Customer row, never a parallel shape.
 */
class CustomerService
{
    /**
     * @param  array<string, mixed>  $validated
     */
    public function create(array $validated): Customer
    {
        return DB::transaction(function () use ($validated) {
            $customer = Customer::create([
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
        $customer->save();

        return $customer;
    }
}
