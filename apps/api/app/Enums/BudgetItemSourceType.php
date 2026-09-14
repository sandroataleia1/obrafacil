<?php

namespace App\Enums;

/**
 * BUDGET-API-01. Where a BudgetItem's numbers came from:
 * - `catalog`: a CatalogItem, resolved/snapshotted server-side.
 * - `calculator`: a frontend quantity calculator result (identified by
 *   the required `calculator_type`: masonry/floor/ceiling/slab),
 *   submitted as already-computed values, optionally with a
 *   `calculation_snapshot` of the calculator's inputs for audit — never
 *   re-derived server-side in this gate.
 * - `manual`: fully hand-entered by the user.
 */
enum BudgetItemSourceType: string
{
    case Catalog = 'catalog';
    case Calculator = 'calculator';
    case Manual = 'manual';
}
