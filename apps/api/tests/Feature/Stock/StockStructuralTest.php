<?php

namespace Tests\Feature\Stock;

use App\Models\Concerns\BelongsToCompany;
use App\Models\MaterialConsumption;
use App\Models\StockAdjustment;
use App\Stock\MaterialConsumptionService;
use App\Stock\StockAdjustmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use ReflectionClass;
use Tests\TestCase;

/**
 * SUPPLY-API-01E §82, SS1-SS16.
 */
class StockStructuralTest extends TestCase
{
    use RefreshDatabase;

    /** SS1: material_consumptions table exists with the expected columns. */
    public function test_ss1_material_consumptions_table(): void
    {
        $this->assertTrue(Schema::hasTable('material_consumptions'));
        foreach (['id', 'company_id', 'project_id', 'material_id', 'quantity', 'consumed_at', 'notes'] as $column) {
            $this->assertTrue(Schema::hasColumn('material_consumptions', $column), "Missing column [{$column}].");
        }
    }

    /** SS2: stock_adjustments table exists with the expected columns. */
    public function test_ss2_stock_adjustments_table(): void
    {
        $this->assertTrue(Schema::hasTable('stock_adjustments'));
        foreach (['id', 'company_id', 'project_id', 'material_id', 'type', 'quantity', 'occurred_at', 'reason'] as $column) {
            $this->assertTrue(Schema::hasColumn('stock_adjustments', $column), "Missing column [{$column}].");
        }
    }

    /** SS3: both Models use BelongsToCompany (CompanyScope). */
    public function test_ss3_both_use_belongs_to_company(): void
    {
        $this->assertContains(BelongsToCompany::class, (new ReflectionClass(MaterialConsumption::class))->getTraitNames());
        $this->assertContains(BelongsToCompany::class, (new ReflectionClass(StockAdjustment::class))->getTraitNames());
    }

    /** SS4: quantity is decimal(14,3) on both tables. */
    public function test_ss4_quantity_is_decimal_14_3(): void
    {
        foreach (['material_consumptions', 'stock_adjustments'] as $table) {
            $column = collect(DB::select("
                SELECT numeric_precision, numeric_scale FROM information_schema.columns
                WHERE table_name = '{$table}' AND column_name = 'quantity'
            "))->first();

            $this->assertSame(14, $column->numeric_precision, "{$table}.quantity precision");
            $this->assertSame(3, $column->numeric_scale, "{$table}.quantity scale");
        }
    }

    /** SS5: the quantity positive CHECK exists on both tables. */
    public function test_ss5_quantity_positive_check_both(): void
    {
        foreach (['material_consumptions' => 'material_consumptions_quantity_positive_check', 'stock_adjustments' => 'stock_adjustments_quantity_positive_check'] as $table => $constraint) {
            $names = collect(DB::select("
                SELECT conname FROM pg_constraint WHERE conrelid = '{$table}'::regclass AND contype = 'c'
            "))->pluck('conname');

            $this->assertTrue($names->contains($constraint), "Missing [{$constraint}] on [{$table}].");
        }
    }

    /** SS6: the adjustment type CHECK exists. */
    public function test_ss6_adjustment_type_check(): void
    {
        $names = collect(DB::select("
            SELECT conname FROM pg_constraint WHERE conrelid = 'stock_adjustments'::regclass AND contype = 'c'
        "))->pluck('conname');

        $this->assertTrue($names->contains('stock_adjustments_type_check'));
    }

    /** SS7: Project FK is restrictOnDelete on both tables. */
    public function test_ss7_project_fk_restrict(): void
    {
        foreach (['material_consumptions', 'stock_adjustments'] as $table) {
            $fk = collect(DB::select("
                SELECT confdeltype FROM pg_constraint
                WHERE conrelid = '{$table}'::regclass AND contype = 'f' AND conname LIKE '%project_id%'
            "))->first();

            $this->assertSame('r', $fk->confdeltype, "{$table}.project_id FK");
        }
    }

    /** SS8: Material FK is restrictOnDelete on both tables. */
    public function test_ss8_material_fk_restrict(): void
    {
        foreach (['material_consumptions', 'stock_adjustments'] as $table) {
            $fk = collect(DB::select("
                SELECT confdeltype FROM pg_constraint
                WHERE conrelid = '{$table}'::regclass AND contype = 'f' AND conname LIKE '%material_id%'
            "))->first();

            $this->assertSame('r', $fk->confdeltype, "{$table}.material_id FK");
        }
    }

    /** SS9: no central stock table exists. */
    public function test_ss9_no_stock_table(): void
    {
        $this->assertFalse(Schema::hasTable('stocks'));
        $this->assertFalse(Schema::hasTable('stock_balances'));
        $this->assertFalse(Schema::hasTable('warehouses'));
    }

    /** SS10: no stock_quantity/balance/available_quantity column exists anywhere. */
    public function test_ss10_no_stock_quantity_column(): void
    {
        foreach (['materials', 'projects', 'material_consumptions', 'stock_adjustments', 'purchase_order_items', 'purchase_orders'] as $table) {
            $this->assertFalse(Schema::hasColumn($table, 'stock_quantity'), "{$table}.stock_quantity");
            $this->assertFalse(Schema::hasColumn($table, 'balance'), "{$table}.balance");
            $this->assertFalse(Schema::hasColumn($table, 'available_quantity'), "{$table}.available_quantity");
        }
    }

    /** SS11: no generic stock_movements table exists. */
    public function test_ss11_no_stock_movements_table(): void
    {
        $this->assertFalse(Schema::hasTable('stock_movements'));
        $this->assertFalse(Schema::hasTable('stock_positions'));
    }

    /** SS12: MaterialConsumption carries no GoodsReceipt/lot/batch reference. */
    public function test_ss12_no_goods_receipt_link_on_consumption(): void
    {
        $this->assertFalse(Schema::hasColumn('material_consumptions', 'goods_receipt_id'));
        $this->assertFalse(Schema::hasColumn('material_consumptions', 'goods_receipt_item_id'));
        $this->assertFalse(Schema::hasColumn('material_consumptions', 'purchase_order_id'));
        $this->assertFalse(Schema::hasColumn('material_consumptions', 'lot'));
        $this->assertFalse(Schema::hasColumn('material_consumptions', 'batch'));
    }

    /** SS13: no finance fields/imports anywhere in the Stock domain. */
    public function test_ss13_no_finance_fields_or_imports(): void
    {
        $this->assertFalse(Schema::hasColumn('material_consumptions', 'payable_id'));
        $this->assertFalse(Schema::hasColumn('stock_adjustments', 'payable_id'));
        $this->assertFalse(Schema::hasTable('payables'));
        $this->assertFalse(Schema::hasTable('project_costs'));

        foreach ([
            app_path('Stock/StockLedgerService.php'),
            app_path('Stock/MaterialConsumptionService.php'),
            app_path('Stock/StockAdjustmentService.php'),
            app_path('Stock/StockPositionService.php'),
        ] as $file) {
            $contents = file_get_contents($file);
            $this->assertStringNotContainsStringIgnoringCase('Payable', $contents, "{$file} must not reference Payable.");
            $this->assertStringNotContainsStringIgnoringCase('ProjectCost', $contents, "{$file} must not reference ProjectCost.");
        }
    }

    /** SS14: MaterialService::hasDependents() now checks all four dependent tables. */
    public function test_ss14_material_service_includes_consumption_and_adjustment(): void
    {
        $source = file_get_contents(app_path('Materials/MaterialService.php'));

        $this->assertStringContainsString('MaterialConsumption::query()', $source);
        $this->assertStringContainsString('StockAdjustment::query()', $source);
    }

    /** SS15: no update/delete route exists for StockAdjustment. */
    public function test_ss15_no_adjustment_update_delete_routes(): void
    {
        $routes = collect(app('router')->getRoutes())->map(fn ($route) => $route->uri());

        $this->assertFalse($routes->contains(fn ($uri) => str_contains($uri, 'stock-adjustments/{')));
    }

    /** SS16: zero notification side effects across the new Stock services. */
    public function test_ss16_zero_notification_side_effects(): void
    {
        foreach ([MaterialConsumptionService::class, StockAdjustmentService::class] as $class) {
            $reflection = new ReflectionClass($class);
            $source = file_get_contents($reflection->getFileName());

            $this->assertStringNotContainsStringIgnoringCase('NotificationEvent', $source);
            $this->assertStringNotContainsStringIgnoringCase('NotificationDelivery', $source);
            $this->assertStringNotContainsStringIgnoringCase('Job', $source);
        }
    }
}
