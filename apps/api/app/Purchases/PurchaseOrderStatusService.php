<?php

namespace App\Purchases;

use App\Enums\PurchaseOrderCommercialStatus;
use App\Models\GoodsReceipt;
use App\Models\PurchaseOrder;
use App\Purchases\Exceptions\PurchaseOrderConcurrencyConflictException;
use App\Purchases\Exceptions\PurchaseOrderStatusConflictException;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * SUPPLY-API-01C §22-27/§65. The only place commercial_status changes —
 * never via the generic header PUT (§21). Each action encodes exactly one
 * allowed transition (§23):
 *   confirm():        draft -> ordered
 *   cancel():          draft|ordered -> cancelled
 *   returnToDraft():   ordered|cancelled -> draft
 * `cancelled -> ordered` is impossible by construction — confirm() only
 * ever accepts a Order currently in draft, so reconfirming a cancelled
 * Order must go through returnToDraft() first (ADR-017).
 *
 * §65: confirm() loads Items fresh from the DB, inside the same
 * lock/transaction — never trusts an array the caller might pass in.
 *
 * SUPPLY-API-01D §43-45/§62: `returnToDraft()`/`cancel()` both consult
 * GoodsReceipt/fulfillment state fresh from the DB, inside the same Order
 * lock — never a `hasGoodsReceipts` flag from the frontend (§44).
 */
class PurchaseOrderStatusService
{
    public function __construct(
        private readonly PurchaseOrderLocker $locker,
        private readonly PurchaseOrderFulfillmentService $fulfillmentService,
    ) {}

    public function confirm(PurchaseOrder|string $purchaseOrder, string $providedUpdatedAt): PurchaseOrder
    {
        return DB::transaction(function () use ($purchaseOrder, $providedUpdatedAt) {
            $locked = $this->locker->lock($purchaseOrder);
            $this->assertNotStale($locked, $providedUpdatedAt);

            if ($locked->commercial_status !== PurchaseOrderCommercialStatus::Draft) {
                throw new PurchaseOrderStatusConflictException('Este pedido não está em rascunho e não pode ser confirmado.');
            }

            $items = $locked->items()->get();

            if ($items->isEmpty()) {
                throw ValidationException::withMessages([
                    'items' => 'Adicione ao menos um item antes de confirmar o pedido.',
                ]);
            }

            foreach ($items as $item) {
                if (Money::compare((string) $item->unit_price, '0') <= 0) {
                    throw ValidationException::withMessages([
                        'items' => 'Todos os itens precisam ter preço unitário maior que zero para confirmar o pedido.',
                    ]);
                }
            }

            $locked->commercial_status = PurchaseOrderCommercialStatus::Ordered;
            $locked->save();

            return $locked->fresh(['supplier', 'project']);
        });
    }

    public function cancel(PurchaseOrder|string $purchaseOrder, string $providedUpdatedAt): PurchaseOrder
    {
        return DB::transaction(function () use ($purchaseOrder, $providedUpdatedAt) {
            $locked = $this->locker->lock($purchaseOrder);
            $this->assertNotStale($locked, $providedUpdatedAt);

            if (! in_array($locked->commercial_status, [PurchaseOrderCommercialStatus::Draft, PurchaseOrderCommercialStatus::Ordered], true)) {
                throw new PurchaseOrderStatusConflictException('Este pedido já está cancelado.');
            }

            // SUPPLY-API-01D §45: a fully-received ordered Order cannot
            // be cancelled — partial and not_received both remain
            // cancellable (§46: the remaining quantity stays
            // mathematically derived, cancellation doesn't rewrite it).
            if ($locked->commercial_status === PurchaseOrderCommercialStatus::Ordered) {
                $locked->loadMissing('items');
                $status = $this->fulfillmentService->computeAndAttach($locked);

                if ($status === PurchaseOrderFulfillmentService::RECEIVED) {
                    throw new PurchaseOrderStatusConflictException('Este pedido já foi totalmente recebido.');
                }
            }

            $locked->commercial_status = PurchaseOrderCommercialStatus::Cancelled;
            $locked->save();

            return $locked->fresh(['supplier', 'project']);
        });
    }

    public function returnToDraft(PurchaseOrder|string $purchaseOrder, string $providedUpdatedAt): PurchaseOrder
    {
        return DB::transaction(function () use ($purchaseOrder, $providedUpdatedAt) {
            $locked = $this->locker->lock($purchaseOrder);
            $this->assertNotStale($locked, $providedUpdatedAt);

            if (! in_array($locked->commercial_status, [PurchaseOrderCommercialStatus::Ordered, PurchaseOrderCommercialStatus::Cancelled], true)) {
                throw new PurchaseOrderStatusConflictException('Este pedido já está em rascunho.');
            }

            // SUPPLY-API-01D §43/§47: any physical receipt (ordered OR
            // cancelled) blocks a return to draft — physical history
            // never gets silently reopened as a commercial draft.
            $hasGoodsReceipts = GoodsReceipt::query()->where('purchase_order_id', $locked->id)->exists();
            if ($hasGoodsReceipts) {
                throw new PurchaseOrderStatusConflictException(
                    'Este pedido possui recebimentos registrados e não pode voltar para rascunho. Remova os recebimentos primeiro.'
                );
            }

            $locked->commercial_status = PurchaseOrderCommercialStatus::Draft;
            $locked->save();

            return $locked->fresh(['supplier', 'project']);
        });
    }

    private function assertNotStale(PurchaseOrder $locked, string $providedUpdatedAt): void
    {
        $provided = Carbon::parse($providedUpdatedAt);

        if ($locked->updated_at === null || ! $locked->updated_at->equalTo($provided)) {
            throw new PurchaseOrderConcurrencyConflictException(
                'O pedido de compra foi alterado por outra pessoa. Recarregue os dados e tente novamente.'
            );
        }
    }
}
