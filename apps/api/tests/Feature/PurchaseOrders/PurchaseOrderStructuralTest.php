<?php

namespace Tests\Feature\PurchaseOrders;

use App\Materials\MaterialService;
use App\Suppliers\SupplierService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use ReflectionClass;
use ReflectionMethod;
use Tests\TestCase;

/**
 * SUPPLY-API-01C §81, ST1-ST16.
 */
class PurchaseOrderStructuralTest extends TestCase
{
    use RefreshDatabase;

    /** ST1: purchase_order_sequences exists. */
    public function test_st1_purchase_order_sequences_table_exists(): void
    {
        $this->assertTrue(Schema::hasTable('purchase_order_sequences'));
        $this->assertTrue(Schema::hasColumn('purchase_order_sequences', 'next_number'));
    }

    /** ST2: purchase_orders schema — key columns exist, no forbidden ones. */
    public function test_st2_purchase_orders_schema(): void
    {
        foreach (['id', 'company_id', 'number', 'supplier_id', 'project_id', 'order_date', 'expected_delivery_date', 'commercial_status', 'notes'] as $column) {
            $this->assertTrue(Schema::hasColumn('purchase_orders', $column), "Missing column [{$column}].");
        }
    }

    /** ST3: purchase_order_items schema — key columns exist. */
    public function test_st3_purchase_order_items_schema(): void
    {
        foreach (['id', 'company_id', 'purchase_order_id', 'material_id', 'description', 'unit_code', 'unit_custom_label', 'quantity', 'unit_price'] as $column) {
            $this->assertTrue(Schema::hasColumn('purchase_order_items', $column), "Missing column [{$column}].");
        }
    }

    /** ST4: the commercial_status CHECK constraint exists. */
    public function test_st4_commercial_status_check_exists(): void
    {
        $names = collect(DB::select("
            SELECT conname FROM pg_constraint WHERE conrelid = 'purchase_orders'::regclass AND contype = 'c'
        "))->pluck('conname');

        $this->assertTrue($names->contains('purchase_orders_commercial_status_check'));
    }

    /** ST5: the (company_id, number) unique constraint exists. */
    public function test_st5_unique_company_number_exists(): void
    {
        $indexes = collect(DB::select("
            SELECT indexdef FROM pg_indexes WHERE tablename = 'purchase_orders' AND indexdef ILIKE '%UNIQUE%'
        "));

        $this->assertTrue($indexes->contains(fn ($i) => str_contains($i->indexdef, 'company_id') && str_contains($i->indexdef, 'number')));
    }

    /** ST6: the (purchase_order_id, material_id) unique constraint exists, named explicitly. */
    public function test_st6_item_unique_order_material_exists(): void
    {
        $indexes = collect(DB::select("
            SELECT indexname, indexdef FROM pg_indexes
            WHERE tablename = 'purchase_order_items' AND indexname = 'purchase_order_items_order_material_unique'
        "));

        $this->assertCount(1, $indexes);
        $this->assertStringContainsString('UNIQUE', $indexes->first()->indexdef);
    }

    /** ST7: quantity is decimal(14,3). */
    public function test_st7_quantity_is_decimal_14_3(): void
    {
        $column = collect(DB::select("
            SELECT numeric_precision, numeric_scale FROM information_schema.columns
            WHERE table_name = 'purchase_order_items' AND column_name = 'quantity'
        "))->first();

        $this->assertSame(14, $column->numeric_precision);
        $this->assertSame(3, $column->numeric_scale);
    }

    /** ST8: unit_price is decimal(14,2). */
    public function test_st8_unit_price_is_decimal_14_2(): void
    {
        $column = collect(DB::select("
            SELECT numeric_precision, numeric_scale FROM information_schema.columns
            WHERE table_name = 'purchase_order_items' AND column_name = 'unit_price'
        "))->first();

        $this->assertSame(14, $column->numeric_precision);
        $this->assertSame(2, $column->numeric_scale);
    }

    /** ST9: the quantity positive CHECK exists. */
    public function test_st9_quantity_positive_check_exists(): void
    {
        $names = collect(DB::select("
            SELECT conname FROM pg_constraint WHERE conrelid = 'purchase_order_items'::regclass AND contype = 'c'
        "))->pluck('conname');

        $this->assertTrue($names->contains('purchase_order_items_quantity_positive_check'));
    }

    /** ST10: the unit_price nonnegative CHECK exists. */
    public function test_st10_unit_price_nonnegative_check_exists(): void
    {
        $names = collect(DB::select("
            SELECT conname FROM pg_constraint WHERE conrelid = 'purchase_order_items'::regclass AND contype = 'c'
        "))->pluck('conname');

        $this->assertTrue($names->contains('purchase_order_items_unit_price_nonnegative_check'));
    }

    /** ST11: the unit CHECK and the unit_custom_label biconditional CHECK exist. */
    public function test_st11_unit_check_and_biconditional_exist(): void
    {
        $names = collect(DB::select("
            SELECT conname FROM pg_constraint WHERE conrelid = 'purchase_order_items'::regclass AND contype = 'c'
        "))->pluck('conname');

        $this->assertTrue($names->contains('purchase_order_items_unit_code_check'));
        $this->assertTrue($names->contains('purchase_order_items_unit_custom_label_check'));
    }

    /** ST12: no persisted total column anywhere in this domain. */
    public function test_st12_no_persisted_total_column(): void
    {
        $this->assertFalse(Schema::hasColumn('purchase_orders', 'total'));
        $this->assertFalse(Schema::hasColumn('purchase_order_items', 'line_total'));
    }

    /**
     * ST13: fulfillment is still never a persisted column — SUPPLY-API-01D
     * added the real `goods_receipts`/`goods_receipt_items` tables (its
     * own PurchaseOrderStructuralTest-equivalent, GS1-GS14, proves those
     * structurally), but `fulfillment_status`/`received_quantity`/
     * `remaining_quantity` remain purely derived, never columns.
     */
    public function test_st13_no_fulfillment_fields_or_tables(): void
    {
        $this->assertFalse(Schema::hasColumn('purchase_orders', 'fulfillment_status'));
        $this->assertFalse(Schema::hasColumn('purchase_order_items', 'received_quantity'));
        $this->assertFalse(Schema::hasColumn('purchase_order_items', 'remaining_quantity'));
    }

    /** ST14: no payable/project_cost relation columns/tables. */
    public function test_st14_no_payable_or_project_cost_relation(): void
    {
        $this->assertFalse(Schema::hasColumn('purchase_orders', 'payable_id'));
        $this->assertFalse(Schema::hasColumn('purchase_orders', 'project_cost_id'));
        $this->assertFalse(Schema::hasTable('payables'));
        $this->assertFalse(Schema::hasTable('project_costs'));
    }

    /** ST15: MaterialService::hasDependents() checks MaterialRequirement OR PurchaseOrderItem. */
    public function test_st15_material_service_depends_on_requirement_or_item(): void
    {
        $reflection = new ReflectionClass(MaterialService::class);
        $method = new ReflectionMethod(MaterialService::class, 'hasDependents');
        $source = implode('', array_slice(
            file($reflection->getFileName()),
            $method->getStartLine() - 1,
            $method->getEndLine() - $method->getStartLine() + 1
        ));

        $this->assertStringContainsString('MaterialRequirement::query()', $source);
        $this->assertStringContainsString('PurchaseOrderItem::query()', $source);
    }

    /** ST16: SupplierService::hasPurchaseOrders() checks PurchaseOrder for real (not a stub returning false). */
    public function test_st16_supplier_service_depends_on_purchase_order(): void
    {
        $reflection = new ReflectionClass(SupplierService::class);
        $method = new ReflectionMethod(SupplierService::class, 'hasPurchaseOrders');
        $source = implode('', array_slice(
            file($reflection->getFileName()),
            $method->getStartLine() - 1,
            $method->getEndLine() - $method->getStartLine() + 1
        ));

        $this->assertStringContainsString('PurchaseOrder::query()', $source);
        $this->assertStringNotContainsString('return false;', $source);
    }
}
