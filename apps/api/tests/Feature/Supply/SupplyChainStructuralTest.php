<?php

namespace Tests\Feature\Supply;

use App\Models\CatalogItem;
use App\Models\Concerns\BelongsToCompany;
use App\Models\Material;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use ReflectionClass;
use Tests\TestCase;

/**
 * SUPPLY-API-01A §41, ST1-ST10. Structural proof that ADR-010/ADR-017's
 * boundaries were not silently crossed: Material stays disconnected from
 * CatalogItem, no stock/PurchaseOrder tables exist yet, and the DB-level
 * CHECK/unique-index backstops are real (not just Request-layer validation).
 */
class SupplyChainStructuralTest extends TestCase
{
    use RefreshDatabase;

    /** ST1: Material uses BelongsToCompany (which registers CompanyScope). */
    public function test_st1_material_uses_belongs_to_company(): void
    {
        $this->assertContains(BelongsToCompany::class, (new ReflectionClass(Material::class))->getTraitNames());
    }

    /** ST2: Supplier uses BelongsToCompany (which registers CompanyScope). */
    public function test_st2_supplier_uses_belongs_to_company(): void
    {
        $this->assertContains(BelongsToCompany::class, (new ReflectionClass(Supplier::class))->getTraitNames());
    }

    /** ST3: materials has no catalog_item_id column — Material stays disconnected from CatalogItem (ADR-010/ADR-017). */
    public function test_st3_materials_has_no_catalog_item_id_column(): void
    {
        $this->assertFalse(Schema::hasColumn('materials', 'catalog_item_id'));
    }

    /** ST4: catalog_items has no material_id column — the link stays absent from both sides. */
    public function test_st4_catalog_items_has_no_material_id_column(): void
    {
        $this->assertFalse(Schema::hasColumn('catalog_items', 'material_id'));
    }

    /** ST5: no stock_quantity column anywhere — stock is always derived, never a mutable column (ADR-017 #9). */
    public function test_st5_no_stock_quantity_column_anywhere(): void
    {
        $this->assertFalse(Schema::hasColumn('materials', 'stock_quantity'));
        $this->assertFalse(Schema::hasColumn('suppliers', 'stock_quantity'));
        $this->assertFalse(Schema::hasColumn('catalog_items', 'stock_quantity'));
    }

    /** ST6: materials has no supplier_id column — no direct Material<->Supplier link in this gate. */
    public function test_st6_materials_has_no_supplier_id_column(): void
    {
        $this->assertFalse(Schema::hasColumn('materials', 'supplier_id'));
    }

    /**
     * ST7: zero GoodsReceipt/Consumption/StockAdjustment tables exist yet
     * — deferred to SUPPLY-API-01D/01E (ADR-017). `material_requirements`
     * (SUPPLY-API-01B) and `purchase_orders`/`purchase_order_items`
     * (SUPPLY-API-01C) were added by later gates and are asserted present
     * (not absent) — see MaterialRequirementStructuralTest/
     * PurchaseOrderStructuralTest for their own dedicated proofs.
     */
    public function test_st7_zero_purchase_order_tables_exist(): void
    {
        foreach ([
            'goods_receipts',
            'material_consumptions',
            'stock_adjustments',
        ] as $table) {
            $this->assertFalse(Schema::hasTable($table), "Table [{$table}] must not exist yet in this gate.");
        }

        $this->assertTrue(Schema::hasTable('material_requirements'), 'material_requirements was added by SUPPLY-API-01B.');
        $this->assertTrue(Schema::hasTable('purchase_orders'), 'purchase_orders was added by SUPPLY-API-01C.');
        $this->assertTrue(Schema::hasTable('purchase_order_items'), 'purchase_order_items was added by SUPPLY-API-01C.');
    }

    /** ST8: zero finance side effects — Material/Supplier domain files never reference Payable/ProjectCost. */
    public function test_st8_zero_finance_references_in_supply_domain_files(): void
    {
        $files = array_merge(
            glob(app_path('Materials/*.php')) ?: [],
            glob(app_path('Suppliers/*.php')) ?: [],
            [app_path('Models/Material.php'), app_path('Models/Supplier.php')],
            [app_path('Http/Controllers/Api/V1/MaterialController.php'), app_path('Http/Controllers/Api/V1/SupplierController.php')],
        );

        $this->assertNotEmpty($files);

        foreach ($files as $file) {
            $contents = file_get_contents($file);
            $this->assertStringNotContainsStringIgnoringCase('Payable', $contents, "{$file} must not reference Payable.");
            $this->assertStringNotContainsStringIgnoringCase('ProjectCost', $contents, "{$file} must not reference ProjectCost.");
        }
    }

    /** ST9: the Material unit CHECK constraints exist structurally, not only in Request validation. */
    public function test_st9_material_unit_check_constraints_exist(): void
    {
        $names = collect(DB::select("
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'materials'::regclass AND contype = 'c'
        "))->pluck('conname');

        $this->assertTrue($names->contains('materials_unit_code_check'));
        $this->assertTrue($names->contains('materials_unit_custom_label_check'));
    }

    /** ST10: the Supplier document format CHECK and partial unique index exist structurally. */
    public function test_st10_supplier_document_check_and_unique_index_exist(): void
    {
        $checkNames = collect(DB::select("
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'suppliers'::regclass AND contype = 'c'
        "))->pluck('conname');

        $this->assertTrue($checkNames->contains('suppliers_document_format_check'));

        $indexes = collect(DB::select("
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'suppliers' AND indexname = 'suppliers_company_document_unique'
        "));

        $this->assertCount(1, $indexes);
        $this->assertStringContainsString('UNIQUE', $indexes->first()->indexdef);
        $this->assertStringContainsString('WHERE (document IS NOT NULL)', $indexes->first()->indexdef);
    }

    /** ST9 companion: Material and Supplier models declare no relations to nonexistent tables (no fictional relations). */
    public function test_material_and_supplier_have_no_purchase_order_or_catalog_relations(): void
    {
        foreach (['catalogItem', 'purchaseOrders', 'purchaseOrderItems', 'materialRequirements'] as $method) {
            $this->assertFalse(method_exists(Material::class, $method));
        }

        foreach (['purchaseOrders', 'materials'] as $method) {
            $this->assertFalse(method_exists(Supplier::class, $method));
        }
    }
}
