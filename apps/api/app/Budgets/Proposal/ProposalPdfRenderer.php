<?php

namespace App\Budgets\Proposal;

use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\View;
use RuntimeException;

/**
 * PROPOSAL-DOC-01A §25-26/§39. HTML/Blade -> PDF only — never assembles
 * document data itself (that's `ProposalDocumentDataBuilder`'s job).
 * `dompdf/dompdf` is required directly (no Laravel wrapper package — §23),
 * with remote fetches disabled (`isRemoteEnabled = false`, §40: the logo
 * is always embedded as a base64 data URI by the data builder, never a
 * remote/HTTP image) and DejaVu Sans as the default font, which ships
 * bundled with dompdf and covers the accented Portuguese characters and
 * the `R$` sign this document needs (§39) without adding/downloading any
 * custom font.
 */
class ProposalPdfRenderer
{
    /**
     * @return string raw PDF bytes
     */
    public function render(ProposalDocumentData $data): string
    {
        $view = match ($data->templateVersion) {
            // §10/§26: an unknown version fails loudly — never silently
            // falls back to whatever the "latest" template happens to be.
            1 => 'proposals.pdf.v1',
            default => throw new RuntimeException("Unsupported proposal template version: {$data->templateVersion}"),
        };

        $html = View::make($view, ['data' => $data])->render();

        $options = new Options;
        $options->setIsRemoteEnabled(false);
        $options->setIsHtml5ParserEnabled(true);
        $options->setDefaultFont('DejaVu Sans');

        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($html, 'UTF-8');
        $dompdf->setPaper('a4', 'portrait');
        $dompdf->render();

        // §38: "Página X de Y" + the proposal number in the footer of
        // every page — dompdf's canvas-level page_text/{PAGE_NUM}/
        // {PAGE_COUNT} placeholders, not a raw `<script type="text/php">`
        // block in the template (never enabling dompdf's PHP-evaluation
        // mode for HTML it renders).
        $canvas = $dompdf->getCanvas();
        $font = $dompdf->getFontMetrics()->getFont('DejaVu Sans');
        $canvas->page_text(
            $canvas->get_width() - 150,
            $canvas->get_height() - 30,
            "Página {PAGE_NUM} de {PAGE_COUNT} — {$data->number}",
            $font,
            8,
            [0.4, 0.4, 0.4]
        );

        return $dompdf->output();
    }
}
