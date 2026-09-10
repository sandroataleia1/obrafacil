<?php

namespace App\Customers;

use App\Models\Customer;
use App\Models\CustomerContact;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Mirrors CustomerAddressService's primary-switch invariant exactly
 * (addendum §74/§83-85) — a customer has at most one primary contact,
 * enforced atomically here and structurally by a real partial unique
 * index.
 */
class CustomerContactService
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    public function create(Customer $customer, array $attributes): CustomerContact
    {
        return DB::transaction(function () use ($customer, $attributes) {
            $hasExisting = $customer->contacts()->exists();
            // §75: the first contact for a customer is always primary,
            // regardless of what the client sent.
            $isPrimary = ! $hasExisting || (bool) ($attributes['is_primary'] ?? false);

            if ($isPrimary && $hasExisting) {
                $customer->contacts()->where('is_primary', true)->update(['is_primary' => false]);
            }

            return $customer->contacts()->create([...$attributes, 'is_primary' => $isPrimary]);
        });
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function update(Customer $customer, CustomerContact $contact, array $attributes): CustomerContact
    {
        return DB::transaction(function () use ($customer, $contact, $attributes) {
            $wantsPrimary = array_key_exists('is_primary', $attributes)
                ? (bool) $attributes['is_primary']
                : $contact->is_primary;

            if ($contact->is_primary && ! $wantsPrimary) {
                $hasOthers = $customer->contacts()->whereKeyNot($contact->id)->exists();

                if ($hasOthers) {
                    // §84: the only sanctioned way to change the primary
                    // is to mark a *different* contact as primary.
                    throw ValidationException::withMessages([
                        'is_primary' => 'Defina outro contato principal antes de desmarcar este.',
                    ]);
                }

                $wantsPrimary = true;
            }

            if ($wantsPrimary && ! $contact->is_primary) {
                $customer->contacts()->whereKeyNot($contact->id)->where('is_primary', true)->update(['is_primary' => false]);
            }

            $contact->fill([...$attributes, 'is_primary' => $wantsPrimary]);
            $contact->save();

            return $contact;
        });
    }

    public function delete(Customer $customer, CustomerContact $contact): void
    {
        DB::transaction(function () use ($customer, $contact) {
            if ($contact->is_primary) {
                $hasOthers = $customer->contacts()->whereKeyNot($contact->id)->exists();

                if ($hasOthers) {
                    // §85: never auto-promote another contact.
                    throw ValidationException::withMessages([
                        'contact' => 'Defina outro contato principal antes de excluir este contato.',
                    ]);
                }
            }

            $contact->delete();
        });
    }
}
