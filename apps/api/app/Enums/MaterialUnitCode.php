<?php

namespace App\Enums;

/**
 * SUPPLY-API-01A §4/§6. The closed set of operational units a Material can
 * be tracked in — no conversion between any of them exists or ever will
 * (ADR-017 #3). `Other` is the escape hatch for a unit not in this list,
 * paired with a required `unit_custom_label` (see the
 * `materials_unit_custom_label_check` biconditional).
 */
enum MaterialUnitCode: string
{
    case Un = 'un';
    case Kg = 'kg';
    case T = 't';
    case M = 'm';
    case M2 = 'm2';
    case M3 = 'm3';
    case L = 'l';
    case Sc = 'sc';
    case Cx = 'cx';
    case Other = 'other';
}
