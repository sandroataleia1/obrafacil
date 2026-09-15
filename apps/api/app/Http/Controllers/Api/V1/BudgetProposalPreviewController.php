<?php

namespace App\Http\Controllers\Api\V1;

use App\Budgets\Proposal\ProposalDocumentDataBuilder;
use App\Budgets\Proposal\ProposalPdfRenderer;
use App\Budgets\Proposal\ProposalPdfResponse;
use App\Enums\BudgetStatus;
use App\Http\Controllers\Controller;
use App\Models\Budget;
use App\Support\CurrentCompanyContext;
use Illuminate\Http\Response;

/**
 * GET /api/v1/budgets/{budget}/proposal-preview.pdf — authenticated,
 * tenant-scoped (§41). For a DRAFT Budget, renders from the CURRENT
 * Company profile/logo (never persists anything, never touches status/
 * token). For a submitted Budget (pending_approval/approved/rejected),
 * renders EXCLUSIVELY from the frozen `company_snapshot`/
 * `proposal_logo_path` — never the live Company (§42), same source the
 * public PDF endpoint uses.
 */
class BudgetProposalPreviewController extends Controller
{
    public function __construct(
        private readonly ProposalDocumentDataBuilder $dataBuilder,
        private readonly ProposalPdfRenderer $renderer,
        private readonly CurrentCompanyContext $context,
    ) {}

    public function show(string $budget): Response
    {
        $model = Budget::query()->with('items')->findOrFail($budget);

        $data = $model->status === BudgetStatus::Draft
            ? $this->dataBuilder->forDraftPreview($model, $this->context->get())
            : $this->dataBuilder->forSubmitted($model);

        $pdf = $this->renderer->render($data);

        return ProposalPdfResponse::make($pdf, $model->formattedNumber());
    }
}
