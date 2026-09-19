<?php

namespace Tests\Feature\GoodsReceipts;

use App\Models\Concerns\BelongsToCompany;
use App\Models\GoodsReceipt;
use App\Models\GoodsReceiptItem;
use App\Purchases\GoodsReceiptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use ReflectionClass;
use Tests\TestCase;

/**
 * SUPPLY-API-01D §73, GS1-GS14.
 */
class GoodsReceiptStructuralTest extends TestCase
{
    use RefreshDatabase;

    /** GS1: goods_receipts table exists with the expected columns. */
    public function test_gs1_goods_receipts_table(): void
    {
        $this->assertTrue(Schema::hasTable('goods_receipts'));
        foreach (['id', 'company_id', 'purchase_order_id', 'received_at', 'notes'] as $column) {
            $this->assertTrue(Schema::hasColumn('goods_receipts', $column), "Missing column [{$column}].");
        }
    }

    /** GS2: goods_receipt_items table exists with the expected columns. */
    public function test_gs2_goods_receipt_items_table(): void
    {
        $this->assertTrue(Schema::hasTable('goods_receipt_items'));
        foreach (['id', 'company_id', 'goods_receipt_id', 'purchase_order_item_id', 'quantity'] as $column) {
            $this->assertTrue(Schema::hasColumn('goods_receipt_items', $column), "Missing column [{$column}].");
        }
    }

    /** GS3: both Models use BelongsToCompany (CompanyScope). */
    public function test_gs3_both_use_belongs_to_company(): void
    {
        $this->assertContains(BelongsToCompany::class, (new ReflectionClass(GoodsReceipt::class))->getTraitNames());
        $this->assertContains(BelongsToCompany::class, (new ReflectionClass(GoodsReceiptItem::class))->getTraitNames());
    }

    /** GS4: quantity is decimal(14,3). */
    public function test_gs4_quantity_is_decimal_14_3(): void
    {
        $column = collect(DB::select("
            SELECT numeric_precision, numeric_scale FROM information_schema.columns
            WHERE table_name = 'goods_receipt_items' AND column_name = 'quantity'
        "))->first();

        $this->assertSame(14, $column->numeric_precision);
        $this->assertSame(3, $column->numeric_scale);
    }

    /** GS5: the quantity positive CHECK exists. */
    public function test_gs5_quantity_check_exists(): void
    {
        $names = collect(DB::select("
            SELECT conname FROM pg_constraint WHERE conrelid = 'goods_receipt_items'::regclass AND contype = 'c'
        "))->pluck('conname');

        $this->assertTrue($names->contains('goods_receipt_items_quantity_positive_check'));
    }

    /** GS6: the (goods_receipt_id, purchase_order_item_id) unique constraint exists, named explicitly. */
    public function test_gs6_unique_receipt_order_item_exists(): void
    {
        $indexes = collect(DB::select("
            SELECT indexname, indexdef FROM pg_indexes
            WHERE tablename = 'goods_receipt_items' AND indexname = 'goods_receipt_items_receipt_order_item_unique'
        "));

        $this->assertCount(1, $indexes);
        $this->assertStringContainsString('UNIQUE', $indexes->first()->indexdef);
    }

    /** GS7: both FKs on goods_receipts/goods_receipt_items are restrictOnDelete. */
    public function test_gs7_fks_are_restrict_on_delete(): void
    {
        $purchaseOrderFk = collect(DB::select("
            SELECT confdeltype FROM pg_constraint
            WHERE conrelid = 'goods_receipts'::regclass AND contype = 'f' AND conname LIKE '%purchase_order_id%'
        "))->first();
        $this->assertSame('r', $purchaseOrderFk->confdeltype);

        $receiptFk = collect(DB::select("
            SELECT confdeltype FROM pg_constraint
            WHERE conrelid = 'goods_receipt_items'::regclass AND contype = 'f' AND conname LIKE '%goods_receipt_id%'
        "))->first();
        $this->assertSame('r', $receiptFk->confdeltype);

        $orderItemFk = collect(DB::select("
            SELECT confdeltype FROM pg_constraint
            WHERE conrelid = 'goods_receipt_items'::regclass AND contype = 'f' AND conname LIKE '%purchase_order_item_id%'
        "))->first();
        $this->assertSame('r', $orderItemFk->confdeltype);
    }

    /** GS8: no material_id column on the receipt line. */
    public function test_gs8_no_material_id_on_receipt_line(): void
    {
        $this->assertFalse(Schema::hasColumn('goods_receipt_items', 'material_id'));
    }

    /** GS9: no unit snapshot columns on the receipt line. */
    public function test_gs9_no_unit_snapshot_on_receipt_line(): void
    {
        $this->assertFalse(Schema::hasColumn('goods_receipt_items', 'unit_code'));
        $this->assertFalse(Schema::hasColumn('goods_receipt_items', 'unit_custom_label'));
        $this->assertFalse(Schema::hasColumn('goods_receipt_items', 'description'));
    }

    /** GS10: no fulfillment column on purchase_orders. */
    public function test_gs10_no_fulfillment_column_on_order(): void
    {
        $this->assertFalse(Schema::hasColumn('purchase_orders', 'fulfillment_status'));
    }

    /** GS11: no received_quantity column on purchase_order_items. */
    public function test_gs11_no_received_quantity_column_on_item(): void
    {
        $this->assertFalse(Schema::hasColumn('purchase_order_items', 'received_quantity'));
        $this->assertFalse(Schema::hasColumn('purchase_order_items', 'remaining_quantity'));
    }

    /** GS12: no finance fields/tables were added by this gate. */
    public function test_gs12_no_finance_fields_or_tables(): void
    {
        $this->assertFalse(Schema::hasTable('payables'));
        $this->assertFalse(Schema::hasTable('project_costs'));
        $this->assertFalse(Schema::hasColumn('goods_receipts', 'payable_id'));
        $this->assertFalse(Schema::hasColumn('purchase_orders', 'payable_id'));
    }

    /** GS13: no standalone stock table/quantity was introduced. */
    public function test_gs13_no_standalone_stock_table(): void
    {
        $this->assertFalse(Schema::hasTable('stock_positions'));
        $this->assertFalse(Schema::hasTable('stock_movements'));
        $this->assertFalse(Schema::hasTable('material_consumptions'));
        $this->assertFalse(Schema::hasTable('stock_adjustments'));
    }

    /** GS14: zero notification side effects — GoodsReceiptService never references notification infrastructure. */
    public function test_gs14_zero_notification_side_effects(): void
    {
        $reflection = new ReflectionClass(GoodsReceiptService::class);
        $source = file_get_contents($reflection->getFileName());

        $this->assertStringNotContainsStringIgnoringCase('NotificationEvent', $source);
        $this->assertStringNotContainsStringIgnoringCase('NotificationDelivery', $source);
        $this->assertStringNotContainsStringIgnoringCase('Job', $source);
        $this->assertStringNotContainsStringIgnoringCase('Payable', $source);
        $this->assertStringNotContainsStringIgnoringCase('ProjectCost', $source);
    }
}
