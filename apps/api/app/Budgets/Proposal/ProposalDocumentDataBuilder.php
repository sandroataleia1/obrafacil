<?php

namespace App\Budgets\Proposal;

use App\Budgets\CompanyProposalSnapshotBuilder;
use App\Enums\BudgetStatus;
use App\Models\Budget;
use App\Models\BudgetItem;
use App\Models\Company;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

/**
 * PROPOSAL-DOC-01A §25/§41-42/§50-51: transforms a Budget (+ either its
 * frozen `company_snapshot`/`proposal_logo_path`, or a live Company for a
 * draft preview) into the privacy-audited `ProposalDocumentData` the
 * Blade template actually renders. Two entry points, never conflated:
 *
 *  - `forSubmitted()`: pending_approval/approved/rejected ONLY — reads
 *    exclusively from the Budget's own frozen columns, NEVER the live
 *    Company relation (§42). Dates are formatted using the timezone
 *    frozen inside `company_snapshot` (§50) — a Company timezone change
 *    after submit never reflows a historical document's dates.
 *  - `forDraftPreview()`: draft ONLY — builds a snapshot-shaped array
 *    fresh from the CURRENT Company (via `CompanyProposalSnapshotBuilder`,
 *    the same builder `BudgetService::submit()` uses) and the CURRENT
 *    logo, but never persists any of it. Dates use the Company's current
 *    timezone (§51).
 */
class ProposalDocumentDataBuilder
{
    private const DISK = 'public';

    public function __construct(private readonly CompanyProposalSnapshotBuilder $snapshotBuilder) {}

    public function forSubmitted(Budget $budget): ProposalDocumentData
    {
        $snapshot = $budget->company_snapshot ?? [];
        $timezone = $snapshot['timezone'] ?? 'America/Sao_Paulo';

        return $this->build(
            budget: $budget,
            isPreview: false,
            company: $snapshot,
            logoPath: $budget->proposal_logo_path,
            timezone: $timezone,
            templateVersion: $budget->proposal_template_version ?? 1,
        );
    }

    public function forDraftPreview(Budget $budget, Company $company): ProposalDocumentData
    {
        return $this->build(
            budget: $budget,
            isPreview: true,
            company: $this->snapshotBuilder->build($company),
            logoPath: $company->logo_path,
            timezone: $company->timezone,
            templateVersion: 1,
        );
    }

    /**
     * @param  array<string, mixed>  $company
     */
    private function build(
        Budget $budget,
        bool $isPreview,
        array $company,
        ?string $logoPath,
        string $timezone,
        int $templateVersion,
    ): ProposalDocumentData {
        if ($templateVersion !== 1) {
            throw new \RuntimeException("Unsupported proposal template version: {$templateVersion}");
        }

        $issuedAt = $isPreview ? now() : $budget->submitted_at;
        $issuedAtLabel = $issuedAt !== null
            ? Carbon::parse($issuedAt)->setTimezone($timezone)->format('d/m/Y').($isPreview ? ' (pré-visualização)' : '')
            : ($isPreview ? 'Pré-visualização' : '');

        $validUntilLabel = $budget->valid_until !== null
            ? Carbon::parse($budget->valid_until)->format('d/m/Y')
            : null;

        return new ProposalDocumentData(
            number: $budget->formattedNumber(),
            templateVersion: $templateVersion,
            isPreview: $isPreview,
            issuedAtLabel: $issuedAtLabel,
            validUntilLabel: $validUntilLabel,
            title: $budget->title,
            reference: $budget->reference,
            customerName: $budget->customer_name,
            company: $this->buildCompanyBlock($company, $logoPath),
            items: $this->buildItems($budget->items ?? collect()),
            saleSubtotalLabel: ProposalFormatter::money((string) $budget->sale_subtotal),
            discountAmountLabel: (float) $budget->discount_amount > 0 ? ProposalFormatter::money((string) $budget->discount_amount) : null,
            totalLabel: ProposalFormatter::money((string) $budget->total),
            paymentTerms: $budget->payment_terms,
            executionTerms: $budget->execution_terms,
            proposalTerms: $budget->proposal_terms,
            decision: $this->buildDecisionBlock($budget, $timezone, $isPreview),
        );
    }

    /**
     * @param  array<string, mixed>  $company
     * @return array{name: string, legal_name: ?string, trade_name: ?string, document: ?string, phone: ?string, whatsapp: ?string, email: ?string, address_lines: array<int, string>, logo_data_uri: ?string}
     */
    private function buildCompanyBlock(array $company, ?string $logoPath): array
    {
        return [
            'name' => $company['name'] ?? '',
            'legal_name' => $company['legal_name'] ?? null,
            'trade_name' => $company['trade_name'] ?? null,
            'document' => ProposalFormatter::cnpj($company['document'] ?? null),
            'phone' => ProposalFormatter::phone($company['phone'] ?? null),
            'whatsapp' => ProposalFormatter::phone($company['whatsapp'] ?? null),
            'email' => $company['email'] ?? null,
            'address_lines' => $this->buildAddressLines($company['address'] ?? []),
            'logo_data_uri' => $this->logoDataUri($logoPath),
        ];
    }

    /**
     * @param  array<string, mixed>  $address
     * @return array<int, string>
     */
    private function buildAddressLines(array $address): array
    {
        $streetParts = array_filter([$address['street'] ?? null, $address['number'] ?? null]);
        $line1 = implode(', ', $streetParts);
        if (! empty($address['complement'] ?? null)) {
            $line1 = $line1 !== '' ? "{$line1} - {$address['complement']}" : (string) $address['complement'];
        }

        $line2 = implode(' - ', array_filter([
            $address['neighborhood'] ?? null,
            $address['city'] ?? null,
            $address['state'] ?? null,
        ]));

        $postalCode = ProposalFormatter::cep($address['postal_code'] ?? null);
        $line3 = $postalCode !== null ? "CEP {$postalCode}" : null;

        return array_values(array_filter([$line1, $line2, $line3, $address['reference_point'] ?? null], fn ($line) => $line !== null && $line !== ''));
    }

    private function logoDataUri(?string $path): ?string
    {
        if ($path === null || ! Storage::disk(self::DISK)->exists($path)) {
            return null;
        }

        $mimeType = Storage::disk(self::DISK)->mimeType($path) ?: 'application/octet-stream';
        $contents = Storage::disk(self::DISK)->get($path);

        return 'data:'.$mimeType.';base64,'.base64_encode($contents);
    }

    /**
     * @param  iterable<int, BudgetItem>  $items
     * @return array<int, array{name: string, code: ?string, unit: ?string, quantity: string, unit_price: string, line_discount: string, line_total: string}>
     */
    private function buildItems(iterable $items): array
    {
        $rows = [];
        foreach ($items as $item) {
            $rows[] = [
                'name' => $item->name,
                'code' => $item->code,
                'unit' => $item->unit,
                'quantity' => ProposalFormatter::quantity((string) $item->quantity),
                'unit_price' => ProposalFormatter::money((string) $item->unit_price),
                'line_discount' => ProposalFormatter::money((string) $item->line_discount),
                'line_total' => ProposalFormatter::money((string) $item->line_total),
            ];
        }

        return $rows;
    }

    /**
     * @return array{status: string, is_terminal: bool, approved_label: ?string, rejected_label: ?string, pending_notice: ?string}
     */
    private function buildDecisionBlock(Budget $budget, string $timezone, bool $isPreview): array
    {
        $status = $budget->status->value;

        if ($status === BudgetStatus::Draft->value || $status === BudgetStatus::PendingApproval->value) {
            return [
                'status' => $status,
                'is_terminal' => false,
                'approved_label' => null,
                'rejected_label' => null,
                'pending_notice' => 'Esta proposta pode ser aprovada ou recusada pelo link eletrônico enviado ao cliente.',
            ];
        }

        $decidedAtLabel = $budget->decided_at !== null
            ? Carbon::parse($budget->decided_at)->setTimezone($timezone)->format('d/m/Y')
            : '';
        // §36-37: only a public-link decision's name is customer-facing —
        // a manual-internal decision NEVER exposes which internal user
        // (id or name) made it, nor the internal decision_note.
        $isPublicDecision = $budget->decision_source?->value === 'public_link';
        $decidedByName = $isPublicDecision ? $budget->decision_by_name : null;

        if ($status === BudgetStatus::Approved->value) {
            $label = $decidedByName !== null
                ? "Proposta aprovada por {$decidedByName} em {$decidedAtLabel}."
                : "Proposta aprovada em {$decidedAtLabel}.";

            return [
                'status' => $status,
                'is_terminal' => true,
                'approved_label' => $label,
                'rejected_label' => null,
                'pending_notice' => null,
            ];
        }

        $label = $decidedByName !== null
            ? "Proposta recusada por {$decidedByName} em {$decidedAtLabel}."
            : "Proposta recusada em {$decidedAtLabel}.";

        return [
            'status' => $status,
            'is_terminal' => true,
            'approved_label' => null,
            'rejected_label' => $label,
            'pending_notice' => null,
        ];
    }
}
