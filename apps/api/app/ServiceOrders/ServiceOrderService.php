<?php

namespace App\ServiceOrders;

use App\Enums\ServiceOrderStatus;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\CustomerContact;
use App\Models\ServiceOrder;
use App\Models\User;
use App\ServiceOrders\Exceptions\ServiceOrderStatusConflictException;
use App\Support\CurrentCompanyContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * BACKEND-06 §38-42/§48-52. BACKEND-06B §5-8. The single place a
 * ServiceOrder header is created/updated/transitioned — controllers stay
 * thin. `create()` is the one atomic transaction described in §38: number
 * allocation, customer/address/contact resolution + snapshot copy,
 * initial items, and totals all succeed or all roll back together
 * (including the sequence increment — see ServiceOrderNumberAllocator's
 * docblock).
 *
 * `updateHeader()`/`start()`/`complete()`/`cancel()` each wrap their
 * ENTIRE body in `DB::transaction()` and lock the target row
 * (`ServiceOrderLocker::lock()`, a real `SELECT ... FOR UPDATE`) as the
 * very first statement — before reading `status`/`subtotal`/anything
 * else. A `$order` instance the caller loaded before the call is never
 * trusted for those fields; only the locked, freshly-queried instance
 * returned by the locker is authoritative from that point on
 * (BACKEND-06B §3/§5-8/§21). This is what turns "two concurrent
 * complete/cancel/start calls on the same O.S." into "exactly one wins,
 * the other observes the post-lock state and gets a clean 409" instead of
 * a lost update or last-write-wins race.
 */
class ServiceOrderService
{
    public function __construct(
        private readonly ServiceOrderNumberAllocator $numberAllocator,
        private readonly ServiceOrderSettingsService $settingsService,
        private readonly ServiceOrderItemService $itemService,
        private readonly ServiceOrderLocker $locker,
    ) {}

    /**
     * @param  array<string, mixed>  $validated
     */
    public function create(array $validated, User $actingUser): ServiceOrder
    {
        return DB::transaction(function () use ($validated, $actingUser) {
            $companyId = app(CurrentCompanyContext::class)->id();

            $customer = Customer::query()->findOrFail($validated['customer_id']);
            $address = CustomerAddress::query()->where('customer_id', $customer->id)->findOrFail($validated['customer_address_id']);
            $contact = $this->resolveContact($customer, $validated['customer_contact_id'] ?? null);

            $travelFee = Money::normalize((string) ($validated['travel_fee'] ?? $this->settingsService->getDefaultTravelFee()));
            $orderDiscount = Money::normalize((string) ($validated['order_discount'] ?? '0.00'));

            $number = $this->numberAllocator->allocate($companyId);

            // §27/§28: order_discount is applied AFTER every item is added,
            // never up front — ServiceOrderItemService::recalculateTotals()
            // checks order_discount against the *current* subtotal on every
            // single item insert, and a multi-item create's subtotal only
            // reaches its final value once the last item lands. Starting
            // at "0.00" here (and only setting the real target below)
            // avoids a false "discount > subtotal" rejection mid-loop for
            // an order_discount that's perfectly valid against the final
            // total.
            $order = ServiceOrder::create(array_merge(
                [
                    'number' => $number,
                    'status' => ServiceOrderStatus::Open,
                    'responsible_user_id' => $validated['responsible_user_id'] ?? null,
                    'title' => $validated['title'],
                    'description' => $validated['description'] ?? null,
                    'scheduled_start_at' => $validated['scheduled_start_at'] ?? null,
                    'scheduled_end_at' => $validated['scheduled_end_at'] ?? null,
                    'subtotal' => '0.00',
                    'order_discount' => '0.00',
                    'travel_fee' => $travelFee,
                    'total' => '0.00',
                    'notes' => $validated['notes'] ?? null,
                    'created_by_user_id' => $actingUser->id,
                ],
                $this->customerSnapshot($customer),
                $this->addressSnapshot($address),
                $this->contactSnapshot($contact),
                [
                    'customer_id' => $customer->id,
                    'customer_address_id' => $address->id,
                    'customer_contact_id' => $contact?->id,
                ]
            ));

            foreach (($validated['items'] ?? []) as $itemInput) {
                $this->itemService->addItem($order, $itemInput);
            }

            $order->refresh();
            $this->assertOrderDiscountWithinSubtotal($orderDiscount, (string) $order->subtotal);
            $order->order_discount = $orderDiscount;
            $order->total = ServiceOrderCalculator::total((string) $order->subtotal, $orderDiscount, $travelFee);
            $order->save();

            return $order->fresh(['items']);
        });
    }

    /**
     * §39/§40. Always re-resolves and re-copies the Customer/Address/
     * Contact snapshots from whatever is in the payload, even if
     * unchanged — never trusts a snapshot from the frontend. Items are
     * never touched here (§39 — "NÃO sincroniza items silenciosamente").
     *
     * BACKEND-06B §5: locks the row first, then rechecks `status` and
     * calculates `total` against the LOCKED instance's `subtotal` —
     * never the `$order->subtotal` the caller loaded before this call,
     * which a concurrent item mutation could have already changed.
     *
     * @param  array<string, mixed>  $validated
     */
    public function updateHeader(ServiceOrder|string $order, array $validated): ServiceOrder
    {
        return DB::transaction(function () use ($order, $validated) {
            $lockedOrder = $this->locker->lock($order);
            $this->assertEditable($lockedOrder);

            $customer = Customer::query()->findOrFail($validated['customer_id']);
            $address = CustomerAddress::query()->where('customer_id', $customer->id)->findOrFail($validated['customer_address_id']);
            $contact = $this->resolveContact($customer, $validated['customer_contact_id'] ?? null);

            $orderDiscount = Money::normalize((string) ($validated['order_discount'] ?? '0.00'));
            $travelFee = Money::normalize((string) ($validated['travel_fee'] ?? '0.00'));

            $this->assertOrderDiscountWithinSubtotal($orderDiscount, (string) $lockedOrder->subtotal);

            $lockedOrder->fill(array_merge(
                [
                    'responsible_user_id' => $validated['responsible_user_id'] ?? null,
                    'title' => $validated['title'],
                    'description' => $validated['description'] ?? null,
                    'scheduled_start_at' => $validated['scheduled_start_at'] ?? null,
                    'scheduled_end_at' => $validated['scheduled_end_at'] ?? null,
                    'order_discount' => $orderDiscount,
                    'travel_fee' => $travelFee,
                    'total' => ServiceOrderCalculator::total((string) $lockedOrder->subtotal, $orderDiscount, $travelFee),
                    'notes' => $validated['notes'] ?? null,
                ],
                $this->customerSnapshot($customer),
                $this->addressSnapshot($address),
                $this->contactSnapshot($contact),
                [
                    'customer_id' => $customer->id,
                    'customer_address_id' => $address->id,
                    'customer_contact_id' => $contact?->id,
                ]
            ));
            $lockedOrder->save();

            return $lockedOrder;
        });
    }

    /**
     * BACKEND-06B §6: locks first, then checks `status` on the locked
     * instance — a second concurrent `start()` only ever gets to run
     * after the first one's transaction has committed (or rolled back),
     * so it always observes the real post-lock status and cleanly 409s
     * instead of racing the first one's write.
     */
    public function start(ServiceOrder|string $order): ServiceOrder
    {
        return DB::transaction(function () use ($order) {
            $lockedOrder = $this->locker->lock($order);

            if ($lockedOrder->status !== ServiceOrderStatus::Open) {
                throw new ServiceOrderStatusConflictException(
                    $lockedOrder->status->isTerminal()
                        ? 'Esta O.S. já foi finalizada ou cancelada.'
                        : 'Esta O.S. já está em andamento.'
                );
            }

            $lockedOrder->status = ServiceOrderStatus::InProgress;
            $lockedOrder->started_at = now();
            $lockedOrder->save();

            return $lockedOrder;
        });
    }

    /**
     * BACKEND-06B §7/§14/§15/§17: locks first. `complete` racing `cancel`
     * (or another `complete`) always resolves to exactly one terminal
     * transition — whichever transaction acquires the lock first commits
     * its transition, and the other observes `isTerminal() === true` once
     * it finally acquires the lock and 409s, never overwriting the first
     * decision.
     */
    public function complete(ServiceOrder|string $order): ServiceOrder
    {
        return DB::transaction(function () use ($order) {
            $lockedOrder = $this->locker->lock($order);

            if ($lockedOrder->status->isTerminal()) {
                throw new ServiceOrderStatusConflictException('Esta O.S. já foi finalizada ou cancelada.');
            }

            $lockedOrder->status = ServiceOrderStatus::Completed;
            $lockedOrder->completed_at = now();
            $lockedOrder->save();

            return $lockedOrder;
        });
    }

    /**
     * BACKEND-06B §8/§16: same guarantee as `complete()`, symmetrically.
     */
    public function cancel(ServiceOrder|string $order, string $reason): ServiceOrder
    {
        return DB::transaction(function () use ($order, $reason) {
            $lockedOrder = $this->locker->lock($order);

            if ($lockedOrder->status->isTerminal()) {
                throw new ServiceOrderStatusConflictException('Esta O.S. já foi finalizada ou cancelada.');
            }

            $lockedOrder->status = ServiceOrderStatus::Cancelled;
            $lockedOrder->cancelled_at = now();
            $lockedOrder->cancellation_reason = $reason;
            $lockedOrder->save();

            return $lockedOrder;
        });
    }

    private function resolveContact(Customer $customer, ?string $contactId): ?CustomerContact
    {
        if ($contactId === null) {
            return null;
        }

        return CustomerContact::query()->where('customer_id', $customer->id)->findOrFail($contactId);
    }

    private function assertOrderDiscountWithinSubtotal(string $orderDiscount, string $subtotal): void
    {
        if (Money::compare($orderDiscount, $subtotal) > 0) {
            throw ValidationException::withMessages([
                'order_discount' => 'O desconto não pode ser maior que o subtotal.',
            ]);
        }
    }

    private function assertEditable(ServiceOrder $order): void
    {
        if ($order->status->isTerminal()) {
            throw new ServiceOrderStatusConflictException('Esta O.S. já foi finalizada ou cancelada e não pode mais ser editada.');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function customerSnapshot(Customer $customer): array
    {
        return [
            'customer_name' => $customer->name,
            'customer_document' => $customer->document,
            'customer_phone' => $customer->phone,
            'customer_email' => $customer->email,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function addressSnapshot(CustomerAddress $address): array
    {
        return [
            'execution_address_label' => $address->label,
            'execution_address_type' => $address->type->value,
            'execution_postal_code' => $address->postal_code,
            'execution_street' => $address->street,
            'execution_number' => $address->number,
            'execution_complement' => $address->complement,
            'execution_neighborhood' => $address->neighborhood,
            'execution_city' => $address->city,
            'execution_state' => $address->state,
            'execution_reference_point' => $address->reference_point,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function contactSnapshot(?CustomerContact $contact): array
    {
        return [
            'contact_name' => $contact?->name,
            'contact_role' => $contact?->role,
            'contact_department' => $contact?->department,
            'contact_phone' => $contact?->phone,
            'contact_whatsapp' => $contact?->whatsapp,
            'contact_email' => $contact?->email,
        ];
    }
}
