<?php

namespace App\Budgets\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * PROPOSAL-DOC-01A §9: thrown by `BudgetProposalLogoService::copyFromCompany()`
 * when `Company.logo_path` is set but the actual file no longer exists on
 * the `public` disk — never submit silently without a logo in that case.
 * The Budget remains draft (the whole submit transaction rolls back).
 * Mirrors `BudgetStatusConflictException`'s self-rendering pattern.
 */
class ProposalLogoMissingException extends RuntimeException
{
    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 422);
    }
}
