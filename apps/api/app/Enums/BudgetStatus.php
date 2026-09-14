<?php

namespace App\Enums;

/**
 * BUDGET-API-01. `draft` is mutable (header + items). `pending_approval`
 * is fully frozen — the whole point is that the client-facing proposal
 * link can never silently change content after being shared. `approved`/
 * `rejected` are terminal.
 */
enum BudgetStatus: string
{
    case Draft = 'draft';
    case PendingApproval = 'pending_approval';
    case Approved = 'approved';
    case Rejected = 'rejected';

    public function isMutable(): bool
    {
        return $this === self::Draft;
    }

    public function isTerminal(): bool
    {
        return $this === self::Approved || $this === self::Rejected;
    }
}
