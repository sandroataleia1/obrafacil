<?php

namespace App\Enums;

/**
 * SUPPLY-API-01E §18. The only two directions a manual StockAdjustment can
 * take — direction always comes from `type`, never from the sign of
 * `quantity` (which is always stored positive, §19).
 */
enum StockAdjustmentType: string
{
    case AdjustmentIn = 'ADJUSTMENT_IN';
    case AdjustmentOut = 'ADJUSTMENT_OUT';
}
