<?php

namespace App\Purchases;

use App\Enums\PurchaseOrderCommercialStatus;
use App\Models\GoodsReceipt;
use App\Models\Project;
use App\Models\PurchaseOrder;
use App\Models\Supplier;
use App\Purchases\Exceptions\PurchaseOrderConcurrencyConflictException;
use App\Support\CurrentCompanyContext;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * SUPPLY-API-01C §16-21/§35-36. The single place a PurchaseOrder header is
 * created/updated/deleted — controllers stay thin.
 *
 * `create()` is one atomic transaction: number allocation, Supplier/
 * Project resolution, and the insert all succeed or all roll back
 * together (mirrors ProjectService::create()).
 *
 * §43: `create()` locks the Supplier row (`lockForUpdate()`) so a
 * concurrent `SupplierService::delete()` — which takes the same lock —
 * serializes against it instead of racing a plain SELECT-then-INSERT/
 * SELECT-then-DELETE.
 *
 * `updateHeader()`/`deleteDraft()` lock the Order first (PurchaseOrderLocker,
 * real `SELECT ... FOR UPDATE`) and compare the client-supplied
 * `updated_at` precondition against the LOCKED row's real value before
 * anything else (§49/§53).
 */
class PurchaseOrderService
{
    public function __construct(
        private readonly PurchaseOrderNumberAllocator $numberAllocator,
        private readonly PurchaseOrderLocker $locker,
    ) {}

    /**
     * @param  array<string, mixed>  $validated
     */
    public function create(array $validated): PurchaseOrder
    {
        return DB::transaction(function () use ($validated) {
            $companyId = app(CurrentCompanyContext::class)->id();

            // §17/§43: locked (not a plain find()) so a concurrent
            // SupplierService::delete() for this same Supplier serializes
            // against this create() instead of racing.
            $supplier = Supplier::query()->lockForUpdate()->find($validated['supplier_id']);

            if ($supplier === null) {
                throw ValidationException::withMessages(['supplier_id' => 'Fornecedor inválido.']);
            }

            if (! $supplier->active) {
                throw ValidationException::withMessages(['supplier_id' => 'Este fornecedor está inativo.']);
            }

            $project = Project::query()->find($validated['project_id']);

            if ($project === null) {
                throw ValidationException::withMessages(['project_id' => 'Obra inválida.']);
            }

            $number = $this->numberAllocator->allocate($companyId);

            $purchaseOrder = PurchaseOrder::create([
                'number' => $number,
                'supplier_id' => $supplier->id,
                'project_id' => $project->id,
                'order_date' => $validated['order_date'],
                'expected_delivery_date' => $validated['expected_delivery_date'] ?? null,
                'commercial_status' => PurchaseOrderCommercialStatus::Draft,
                'notes' => $validated['notes'] ?? null,
            ]);

            return $purchaseOrder->fresh(['supplier', 'project']);
        });
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    public function updateHeader(PurchaseOrder|string $purchaseOrder, array $validated): PurchaseOrder
    {
        return DB::transaction(function () use ($purchaseOrder, $validated) {
            $locked = $this->locker->lock($purchaseOrder);

            $this->assertNotStale($locked, $validated['updated_at']);

            // §20: cancelled is entirely read-only — ANY header edit
            // attempt is 422, regardless of whether the submitted values
            // actually differ from the current ones.
            if ($locked->commercial_status === PurchaseOrderCommercialStatus::Cancelled) {
                throw ValidationException::withMessages([
                    'commercial_status' => 'Este pedido está cancelado e não pode ser editado.',
                ]);
            }

            $identityLocked = $locked->commercial_status === PurchaseOrderCommercialStatus::Ordered;
            $attrs = [];

            if (array_key_exists('supplier_id', $validated) && $validated['supplier_id'] !== $locked->supplier_id) {
                if ($identityLocked) {
                    throw ValidationException::withMessages([
                        'supplier_id' => 'Não é possível alterar o fornecedor de um pedido já confirmado.',
                    ]);
                }

                // §6-8: locked (not a plain find()) — the target
                // Supplier must still exist/be active by the time this
                // FK actually gets written, so a concurrent
                // SupplierService::delete() for the SAME target Supplier
                // serializes against this reassignment instead of racing
                // a plain SELECT-then-UPDATE (which could otherwise
                // commit a FK to a row that no longer exists, or is
                // deleted moments later without ever seeing this Order).
                $supplier = Supplier::query()->lockForUpdate()->find($validated['supplier_id']);

                if ($supplier === null) {
                    throw ValidationException::withMessages(['supplier_id' => 'Fornecedor inválido.']);
                }

                if (! $supplier->active) {
                    throw ValidationException::withMessages(['supplier_id' => 'Este fornecedor está inativo.']);
                }

                $attrs['supplier_id'] = $supplier->id;
            }

            if (array_key_exists('project_id', $validated) && $validated['project_id'] !== $locked->project_id) {
                if ($identityLocked) {
                    throw ValidationException::withMessages([
                        'project_id' => 'Não é possível alterar a obra de um pedido já confirmado.',
                    ]);
                }

                $project = Project::query()->find($validated['project_id']);

                if ($project === null) {
                    throw ValidationException::withMessages(['project_id' => 'Obra inválida.']);
                }

                $attrs['project_id'] = $project->id;
            }

            if (array_key_exists('order_date', $validated) && $validated['order_date'] !== $locked->order_date->toDateString()) {
                if ($identityLocked) {
                    throw ValidationException::withMessages([
                        'order_date' => 'Não é possível alterar a data do pedido já confirmado.',
                    ]);
                }

                $attrs['order_date'] = $validated['order_date'];
            }

            if (array_key_exists('expected_delivery_date', $validated)) {
                $attrs['expected_delivery_date'] = $validated['expected_delivery_date'];
            }

            if (array_key_exists('notes', $validated)) {
                $attrs['notes'] = $validated['notes'];
            }

            $locked->fill($attrs);
            $locked->save();

            return $locked->fresh(['supplier', 'project']);
        });
    }

    public function deleteDraft(PurchaseOrder|string $purchaseOrder, string $providedUpdatedAt): void
    {
        DB::transaction(function () use ($purchaseOrder, $providedUpdatedAt) {
            $locked = $this->locker->lock($purchaseOrder);

            $this->assertNotStale($locked, $providedUpdatedAt);

            if ($locked->commercial_status !== PurchaseOrderCommercialStatus::Draft) {
                throw ValidationException::withMessages([
                    'commercial_status' => 'Somente pedidos em rascunho podem ser excluídos.',
                ]);
            }

            // SUPPLY-API-01D §48: defense-in-depth — return-to-draft
            // already refuses to reopen a draft with any GoodsReceipt
            // (PurchaseOrderStatusService::returnToDraft()), so this
            // should be structurally unreachable in the normal flow. Kept
            // anyway so a draft delete never depends solely on that other
            // guard's history being perfect, and never surfaces a raw FK
            // exception if it ever were reachable.
            $hasGoodsReceipts = GoodsReceipt::query()->where('purchase_order_id', $locked->id)->exists();
            if ($hasGoodsReceipts) {
                throw ValidationException::withMessages([
                    'commercial_status' => 'Este pedido possui recebimentos registrados e não pode ser excluído.',
                ]);
            }

            // §35/§66: items removed explicitly, never a silent cascade —
            // purchase_order_id is restrictOnDelete precisely so this is
            // the only path that can ever remove a historical Order's rows.
            $locked->items()->delete();
            $locked->delete();
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
