<?php

namespace App\Budgets\Proposal;

/**
 * PROPOSAL-DOC-01A §25: the ONLY thing the Blade template ever sees —
 * never the Budget/Company Eloquent models themselves. This is a
 * deliberate privacy firewall (§48): if a field isn't listed here, the
 * template has no way to accidentally render it, regardless of what
 * exists on the underlying models (cost/margin/notes/customer contact
 * details/internal ids/decision_note/raw file paths).
 *
 * Every money/quantity value arrives here ALREADY FORMATTED as a display
 * string (`ProposalFormatter`) — the template never formats a raw decimal
 * itself.
 */
final class ProposalDocumentData
{
    /**
     * @param  array{
     *     name: string,
     *     legal_name: ?string,
     *     trade_name: ?string,
     *     document: ?string,
     *     phone: ?string,
     *     whatsapp: ?string,
     *     email: ?string,
     *     address_lines: array<int, string>,
     *     logo_data_uri: ?string,
     * }  $company
     * @param  array<int, array{
     *     name: string,
     *     code: ?string,
     *     unit: ?string,
     *     quantity: string,
     *     unit_price: string,
     *     line_discount: string,
     *     line_total: string,
     * }>  $items
     * @param  array{
     *     status: string,
     *     is_terminal: bool,
     *     approved_label: ?string,
     *     rejected_label: ?string,
     *     pending_notice: ?string,
     * }  $decision
     */
    public function __construct(
        public readonly string $number,
        public readonly int $templateVersion,
        public readonly bool $isPreview,
        public readonly string $issuedAtLabel,
        public readonly ?string $validUntilLabel,
        public readonly string $title,
        public readonly ?string $reference,
        public readonly string $customerName,
        public readonly array $company,
        public readonly array $items,
        public readonly string $saleSubtotalLabel,
        public readonly ?string $discountAmountLabel,
        public readonly string $totalLabel,
        public readonly ?string $paymentTerms,
        public readonly ?string $executionTerms,
        public readonly ?string $proposalTerms,
        public readonly array $decision,
    ) {}
}
