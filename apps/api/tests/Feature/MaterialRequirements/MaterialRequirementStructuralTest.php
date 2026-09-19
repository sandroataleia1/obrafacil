<?php

namespace Tests\Feature\MaterialRequirements;

use App\Materials\MaterialService;
use App\Models\Concerns\BelongsToCompany;
use App\Models\MaterialRequirement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use ReflectionClass;
use ReflectionMethod;
use Tests\TestCase;

/**
 * SUPPLY-API-01B §44, MS1-MS10.
 */
class MaterialRequirementStructuralTest extends TestCase
{
    use RefreshDatabase;

    /** MS1: the material_requirements table exists. */
    public function test_ms1_table_exists(): void
    {
        $this->assertTrue(Schema::hasTable('material_requirements'));
    }

    /** MS2: the unique(project_id, material_id) constraint exists, named explicitly. */
    public function test_ms2_unique_project_material_exists(): void
    {
        $indexes = collect(DB::select("
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'material_requirements' AND indexname = 'material_requirements_project_material_unique'
        "));

        $this->assertCount(1, $indexes);
        $this->assertStringContainsString('UNIQUE', $indexes->first()->indexdef);
    }

    /** MS3: the positive-quantity CHECK constraint exists. */
    public function test_ms3_positive_quantity_check_exists(): void
    {
        $names = collect(DB::select("
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'material_requirements'::regclass AND contype = 'c'
        "))->pluck('conname');

        $this->assertTrue($names->contains('material_requirements_quantity_positive_check'));
    }

    /** MS4: required_quantity is decimal(14,3). */
    public function test_ms4_required_quantity_is_decimal_14_3(): void
    {
        $column = collect(DB::select("
            SELECT numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE table_name = 'material_requirements' AND column_name = 'required_quantity'
        "))->first();

        $this->assertNotNull($column);
        $this->assertSame(14, $column->numeric_precision);
        $this->assertSame(3, $column->numeric_scale);
    }

    /** MS5: no unit column on material_requirements — the unit is never snapshotted (§33). */
    public function test_ms5_no_unit_column(): void
    {
        $this->assertFalse(Schema::hasColumn('material_requirements', 'unit_code'));
        $this->assertFalse(Schema::hasColumn('material_requirements', 'unit_label'));
        $this->assertFalse(Schema::hasColumn('material_requirements', 'unit'));
    }

    /** MS6: no project/material name snapshot columns (§34-35) — both are live relations. */
    public function test_ms6_no_project_or_material_name_snapshot(): void
    {
        $this->assertFalse(Schema::hasColumn('material_requirements', 'project_name'));
        $this->assertFalse(Schema::hasColumn('material_requirements', 'material_name'));
    }

    /** MS7: material_id -> materials is restrictOnDelete. */
    public function test_ms7_material_fk_is_restrict_on_delete(): void
    {
        $definitions = collect(DB::select("
            SELECT confdeltype
            FROM pg_constraint
            WHERE conrelid = 'material_requirements'::regclass AND contype = 'f' AND conname LIKE '%material_id%'
        "));

        $this->assertCount(1, $definitions);
        $this->assertSame('r', $definitions->first()->confdeltype);
    }

    /** MS8: project_id -> projects is restrictOnDelete. */
    public function test_ms8_project_fk_is_restrict_on_delete(): void
    {
        $definitions = collect(DB::select("
            SELECT confdeltype
            FROM pg_constraint
            WHERE conrelid = 'material_requirements'::regclass AND contype = 'f' AND conname LIKE '%project_id%'
        "));

        $this->assertCount(1, $definitions);
        $this->assertSame('r', $definitions->first()->confdeltype);
    }

    /**
     * MS9: MaterialService's unit-change guard and delete guard both call
     * the same hasDependents() seam — proven by reading the method's own
     * source for the call, rather than duplicating a parallel guard.
     */
    public function test_ms9_material_service_uses_requirement_dependency(): void
    {
        $reflection = new ReflectionClass(MaterialService::class);
        $source = file_get_contents($reflection->getFileName());

        $this->assertStringContainsString('MaterialRequirement::query()', $source);

        foreach (['assertUnitChangeable', 'assertDeletable'] as $method) {
            $methodReflection = new ReflectionMethod(MaterialService::class, $method);
            $methodSource = implode('', array_slice(
                file($reflection->getFileName()),
                $methodReflection->getStartLine() - 1,
                $methodReflection->getEndLine() - $methodReflection->getStartLine() + 1
            ));
            $this->assertStringContainsString('hasDependents(', $methodSource, "{$method}() must call hasDependents().");
        }
    }

    /**
     * MS10: zero Stock/Finance tables were introduced by this gate.
     * `purchase_orders`/`purchase_order_items` (SUPPLY-API-01C) and
     * `goods_receipts`/`goods_receipt_items` (SUPPLY-API-01D) were
     * legitimately added later — no longer asserted absent here.
     */
    public function test_ms10_zero_purchase_stock_finance_tables_introduced(): void
    {
        foreach ([
            'material_consumptions',
            'stock_adjustments',
            'payables',
            'project_costs',
        ] as $table) {
            $this->assertFalse(Schema::hasTable($table), "Table [{$table}] must not exist — out of scope for this gate.");
        }

        $this->assertFalse(Schema::hasColumn('material_requirements', 'ordered_quantity'));
        $this->assertFalse(Schema::hasColumn('material_requirements', 'received_quantity'));
        $this->assertFalse(Schema::hasColumn('material_requirements', 'consumed_quantity'));
        $this->assertFalse(Schema::hasColumn('material_requirements', 'available_quantity'));
    }

    /** MaterialRequirement uses BelongsToCompany (CompanyScope). */
    public function test_material_requirement_uses_belongs_to_company(): void
    {
        $this->assertContains(
            BelongsToCompany::class,
            (new ReflectionClass(MaterialRequirement::class))->getTraitNames()
        );
    }
}
