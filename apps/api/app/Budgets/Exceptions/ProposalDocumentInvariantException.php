<?php

namespace App\Budgets\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * PROPOSAL-DOC-01A1 §14-16: thrown by `ProposalDocumentDataBuilder::forSubmitted()`
 * when a submitted (non-draft) Budget's historical proposal data is
 * structurally invalid — `company_snapshot` missing, `proposal_template_version`
 * missing/unknown, or the frozen `proposal_logo_path` file no longer
 * exists on disk. A submitted Budget's document data is supposed to be
 * immutable and always-renderable by construction; reaching this
 * exception means that invariant was violated somewhere else (a bug, a
 * manual DB edit, disk corruption) — the document must fail loudly here
 * rather than silently render a degraded/incomplete PDF that LOOKS
 * legitimate. Never thrown for a draft preview (§16: a draft always uses
 * the live Company, which is allowed to have no logo at all).
 */
class ProposalDocumentInvariantException extends RuntimeException
{
    public function render(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Não foi possível gerar o documento desta proposta. Contate o suporte.',
        ], 500);
    }
}
