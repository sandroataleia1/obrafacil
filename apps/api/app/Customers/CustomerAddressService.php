<?php

namespace App\Customers;

use App\Models\Customer;
use App\Models\CustomerAddress;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The only place CustomerAddress rows are created/updated/deleted outside
 * the initial atomic Customer::create() (CustomerService) — enforces the
 * "at most one primary address" invariant (§25/§29-31) atomically, on top
 * of the real partial unique index that makes it structurally impossible
 * even if this service had a bug.
 */
class CustomerAddressService
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    public function create(Customer $customer, array $attributes): CustomerAddress
    {
        return DB::transaction(function () use ($customer, $attributes) {
            $hasExisting = $customer->addresses()->exists();
            // §26: the first address for a customer is always primary,
            // regardless of what the client sent.
            $isPrimary = ! $hasExisting || (bool) ($attributes['is_primary'] ?? false);

            if ($isPrimary && $hasExisting) {
                $customer->addresses()->where('is_primary', true)->update(['is_primary' => false]);
            }

            return $customer->addresses()->create([...$attributes, 'is_primary' => $isPrimary]);
        });
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function update(Customer $customer, CustomerAddress $address, array $attributes): CustomerAddress
    {
        return DB::transaction(function () use ($customer, $address, $attributes) {
            $wantsPrimary = array_key_exists('is_primary', $attributes)
                ? (bool) $attributes['is_primary']
                : $address->is_primary;

            if ($address->is_primary && ! $wantsPrimary) {
                $hasOthers = $customer->addresses()->whereKeyNot($address->id)->exists();

                if ($hasOthers) {
                    // §30: the only sanctioned way to change the primary
                    // is to mark a *different* address as primary — never
                    // a direct is_primary=false on the current one.
                    throw ValidationException::withMessages([
                        'is_primary' => 'Defina outro endereço principal antes de desmarcar este.',
                    ]);
                }

                // The only address — no reason to ever leave it non-primary.
                $wantsPrimary = true;
            }

            if ($wantsPrimary && ! $address->is_primary) {
                $customer->addresses()->whereKeyNot($address->id)->where('is_primary', true)->update(['is_primary' => false]);
            }

            $address->fill([...$attributes, 'is_primary' => $wantsPrimary]);
            $address->save();

            return $address;
        });
    }

    public function delete(Customer $customer, CustomerAddress $address): void
    {
        DB::transaction(function () use ($customer, $address) {
            if ($address->is_primary) {
                $hasOthers = $customer->addresses()->whereKeyNot($address->id)->exists();

                if ($hasOthers) {
                    // §31: never auto-promote another address — an explicit
                    // decision by the user is required first.
                    throw ValidationException::withMessages([
                        'address' => 'Defina outro endereço principal antes de excluir este endereço.',
                    ]);
                }
            }

            $address->delete();
        });
    }
}
