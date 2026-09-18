<?php

namespace App\Enums;

/**
 * SUPPLY-API-01C §1/§14/§23. The commercial (not physical/financial)
 * lifecycle of a PurchaseOrder. Transitions in this gate:
 *   draft -> ordered   (confirm)
 *   draft -> cancelled (cancel)
 *   ordered -> draft   (return-to-draft)
 *   ordered -> cancelled (cancel)
 *   cancelled -> draft (return-to-draft)
 * `cancelled -> ordered` directly is forbidden — reconfirming a cancelled
 * Order goes through `cancelled -> draft -> ordered` (ADR-017).
 */
enum PurchaseOrderCommercialStatus: string
{
    case Draft = 'draft';
    case Ordered = 'ordered';
    case Cancelled = 'cancelled';
}
