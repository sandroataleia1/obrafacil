<?php

namespace App\Enums;

/**
 * PROJECT-API-01 §5-7. All four values are freely inter-transitionable in
 * v1 — no formal state machine, no guards, no started_at/completed_at
 * side effects. This mirrors the current frontend prototype's behavior
 * exactly (any status button can be clicked from any state). A future
 * gate may formalize transitions once the product actually needs guards.
 *
 * Labels belong to the frontend, not here.
 */
enum ProjectStatus: string
{
    case Planning = 'planning';
    case InProgress = 'in_progress';
    case Paused = 'paused';
    case Completed = 'completed';
}
