<?php

namespace App\Enums;

/**
 * BUDGET-API-01. Who decided a Budget's approval outcome:
 * - `manual_internal`: an authenticated, tenant-scoped user via
 *   POST /budgets/{budget}/approve-manually|reject-manually.
 * - `public_link`: the customer, unauthenticated, via
 *   POST /proposals/{token}/approve|reject.
 */
enum BudgetDecisionSource: string
{
    case ManualInternal = 'manual_internal';
    case PublicLink = 'public_link';
}
