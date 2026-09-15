<?php

namespace App\Http\Controllers\Api\V1;

use App\Budgets\BudgetProposalResolver;
use App\Budgets\Proposal\ProposalDocumentDataBuilder;
use App\Budgets\Proposal\ProposalPdfRenderer;
use App\Budgets\Proposal\ProposalPdfResponse;
use App\Http\Controllers\Controller;
use Illuminate\Http\Response;

/**
 * GET /api/v1/proposals/{token}/pdf — PUBLIC, no Sanctum, no
 * resolve-current-company (§43), resolved by the exact same
 * BudgetProposalResolver/token the JSON proposal endpoint uses. A draft
 * never has a `proposal_token` at all, so this 404s for one structurally
 * — never reachable by construction, not merely "not allowed". Always
 * renders from the frozen snapshot (`ProposalDocumentDataBuilder::forSubmitted()`),
 * exactly like the authenticated preview does once a Budget is submitted.
 * Rate-limited via the `proposal-pdf` limiter (§44) — PDF generation is
 * CPU-heavy and this endpoint is unauthenticated.
 */
class PublicProposalPdfController extends Controller
{
    public function __construct(
        private readonly BudgetProposalResolver $resolver,
        private readonly ProposalDocumentDataBuilder $dataBuilder,
        private readonly ProposalPdfRenderer $renderer,
    ) {}

    public function show(string $token): Response
    {
        $budget = $this->resolver->resolveByToken($token);

        $data = $this->dataBuilder->forSubmitted($budget);
        $pdf = $this->renderer->render($data);

        return ProposalPdfResponse::make($pdf, $budget->formattedNumber());
    }
}
