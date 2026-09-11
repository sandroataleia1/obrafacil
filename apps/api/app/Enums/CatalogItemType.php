<?php

namespace App\Enums;

/**
 * BACKEND-05 §5/§6: a CatalogItem is either a `product` (a good sold to
 * the customer — a door, a fixture, supplied paint) or a `service` (labor
 * sold commercially — painting per m², an electrical installation, a
 * technical visit). Both share the exact same schema/validation — this
 * distinction is purely semantic, never enforced as different price/unit
 * rules.
 */
enum CatalogItemType: string
{
    case Product = 'product';
    case Service = 'service';
}
