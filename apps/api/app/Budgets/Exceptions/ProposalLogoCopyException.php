<?php

namespace App\Budgets\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * PROPOSAL-DOC-01A1 §4-6: thrown by `BudgetProposalLogoService::copyFromCompany()`
 * when the source logo file EXISTS but the actual write of the immutable
 * proposal copy fails (`Storage::copy()` returns `false` — the `public`
 * disk is configured with `throw=false`, so a failed write is never an
 * exception to catch, only a falsy return to check). This is a distinct
 * failure mode from `ProposalLogoMissingException` (source file doesn't
 * exist at all) — a storage write failure is a SERVER failure, never a
 * 422 the client caused, so this renders as 500 with a generic message
 * that never leaks internal storage details.
 */
class ProposalLogoCopyException extends RuntimeException
{
    public function render(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Não foi possível gerar a proposta agora. Tente novamente em instantes.',
        ], 500);
    }
}
