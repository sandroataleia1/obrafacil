<?php

namespace App\Http\Requests\Concerns;

use App\Models\CompanyMembership;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\CustomerContact;
use App\Support\CurrentCompanyContext;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;

/**
 * BACKEND-06 §55/§81. Shared by StoreServiceOrderRequest and
 * UpdateServiceOrderRequest — both need the exact same cross-entity
 * ownership checks. Every lookup goes through the tenant-scoped Eloquent
 * models (Customer/CustomerAddress/CustomerContact all apply CompanyScope
 * automatically via BelongsToCompany), so a cross-tenant id and a
 * genuinely nonexistent id produce the exact same generic error message —
 * never revealing which case it was (§55/T13).
 */
trait ValidatesServiceOrderRelations
{
    private function validateCustomerAddressAndContact(ValidatorContract $validator): void
    {
        $customerId = $this->input('customer_id');
        if (! is_string($customerId) || $customerId === '') {
            return;
        }

        $customer = Customer::query()->find($customerId);
        if ($customer === null) {
            $validator->errors()->add('customer_id', 'Cliente inválido.');

            return;
        }

        $addressId = $this->input('customer_address_id');
        if (is_string($addressId) && $addressId !== '') {
            $address = CustomerAddress::query()->where('customer_id', $customer->id)->find($addressId);
            if ($address === null) {
                $validator->errors()->add('customer_address_id', 'Endereço inválido.');
            }
        }

        $contactId = $this->input('customer_contact_id');
        if (is_string($contactId) && $contactId !== '') {
            $contact = CustomerContact::query()->where('customer_id', $customer->id)->find($contactId);
            if ($contact === null) {
                $validator->errors()->add('customer_contact_id', 'Contato inválido.');
            } elseif (! $contact->active) {
                $validator->errors()->add('customer_contact_id', 'Este contato está inativo.');
            }
        }
    }

    private function validateResponsibleUserIsMember(ValidatorContract $validator): void
    {
        $userId = $this->input('responsible_user_id');
        if (! is_string($userId) || $userId === '') {
            return;
        }

        $isMember = CompanyMembership::query()
            ->where('company_id', app(CurrentCompanyContext::class)->id())
            ->where('user_id', $userId)
            ->exists();

        if (! $isMember) {
            $validator->errors()->add('responsible_user_id', 'Responsável inválido.');
        }
    }

    private function validateSchedule(ValidatorContract $validator): void
    {
        $start = $this->input('scheduled_start_at');
        $end = $this->input('scheduled_end_at');
        if (! is_string($start) || $start === '' || ! is_string($end) || $end === '') {
            return;
        }

        $startTimestamp = strtotime($start);
        $endTimestamp = strtotime($end);
        if ($startTimestamp === false || $endTimestamp === false) {
            return;
        }

        if ($endTimestamp < $startTimestamp) {
            $validator->errors()->add('scheduled_end_at', 'O término deve ser igual ou posterior ao início.');
        }
    }
}
