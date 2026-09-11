<?php

namespace App\Enums;

/**
 * BACKEND-06 §10-11/§48-52. Deliberately no `draft` here — the frontend
 * wizard keeps its draft entirely local (localStorage/React state); a
 * ServiceOrder only exists server-side once the wizard's final submit
 * creates it, always as `open`. `completed`/`cancelled` are terminal.
 */
enum ServiceOrderStatus: string
{
    case Open = 'open';
    case InProgress = 'in_progress';
    case Completed = 'completed';
    case Cancelled = 'cancelled';

    public function isTerminal(): bool
    {
        return $this === self::Completed || $this === self::Cancelled;
    }
}
