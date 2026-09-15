<?php

namespace App\Budgets\Proposal;

use Illuminate\Http\Response;

/**
 * PROPOSAL-DOC-01A §45: the one place that turns raw PDF bytes into the
 * HTTP response — shared by both the authenticated preview and the public
 * PDF controllers so the headers never drift between the two. `inline`
 * (not `attachment`) so the PDF opens directly in the browser/viewer;
 * the filename is always the Budget's own number (`ORC-000001.pdf`),
 * NEVER the raw customer name — never something the client sent.
 */
final class ProposalPdfResponse
{
    public static function make(string $pdfBytes, string $budgetNumber): Response
    {
        return response($pdfBytes, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="'.$budgetNumber.'.pdf"',
        ]);
    }
}
