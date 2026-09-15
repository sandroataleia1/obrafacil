{{--
    PROPOSAL-DOC-01A — PDF template v1.

    The ONLY variable available here is `$data` (an
    App\Budgets\Proposal\ProposalDocumentData instance) — never the raw
    Budget/Company/BudgetItem models. If a field isn't on that DTO, it is
    structurally impossible to render it here (§48 privacy audit): no
    company_id/customer_id/customer_document/customer_phone/customer_email,
    no cost_subtotal/unit_cost/line_cost_total/margin_amount/
    margin_percentage, no Budget.notes/calculation_snapshot, no
    created_by_user_id/decision_by_user_id/decision_note/proposal_logo_path.
--}}
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Proposta {{ $data->number }}</title>
<style>
    @page { margin: 90px 40px 60px 40px; }

    body { font-family: 'DejaVu Sans', sans-serif; font-size: 10px; color: #1a1a1a; }

    .header { position: fixed; top: -70px; left: 0; right: 0; height: 70px; }
    .header table { width: 100%; border-collapse: collapse; }
    .header .logo-cell { width: 70px; vertical-align: top; }
    .header .logo-cell img { max-width: 60px; max-height: 60px; }
    .header .identity-cell { vertical-align: top; padding-left: 10px; }
    .header .company-name { font-size: 14px; font-weight: bold; }
    .header .company-line { font-size: 8.5px; color: #444444; margin-top: 1px; }

    h1.doc-title { font-size: 16px; letter-spacing: 1px; margin: 0 0 2px 0; }
    .doc-meta { font-size: 9px; color: #444444; margin-bottom: 14px; }
    .doc-meta .preview-flag { color: #b45309; font-weight: bold; }

    .section-title { font-size: 10.5px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin: 14px 0 4px 0; border-bottom: 1px solid #cccccc; padding-bottom: 2px; }

    table.items { width: 100%; border-collapse: collapse; margin-top: 4px; }
    table.items thead { display: table-header-group; }
    table.items th { background: #f2f2f2; text-align: left; font-size: 8.5px; text-transform: uppercase; padding: 5px 6px; border-bottom: 1px solid #cccccc; }
    table.items td { padding: 5px 6px; border-bottom: 1px solid #eeeeee; font-size: 9.5px; vertical-align: top; }
    table.items td.num, table.items th.num { text-align: right; }
    table.items .item-description { font-size: 8px; color: #666666; margin-top: 1px; }

    table.summary { width: 260px; margin-left: auto; margin-top: 8px; border-collapse: collapse; }
    table.summary td { padding: 3px 6px; font-size: 10px; }
    table.summary td.label { color: #444444; }
    table.summary td.value { text-align: right; }
    table.summary tr.total td { font-size: 13px; font-weight: bold; border-top: 1px solid #333333; padding-top: 6px; }

    .conditions-block { margin-bottom: 8px; }
    .conditions-block .label { font-weight: bold; font-size: 9.5px; }
    .conditions-block .text { font-size: 9.5px; white-space: pre-wrap; margin-top: 1px; }

    .acceptance { margin-top: 18px; padding-top: 8px; border-top: 1px solid #cccccc; }
    .acceptance .title { font-size: 11px; font-weight: bold; margin-bottom: 4px; }
    .acceptance .notice { font-size: 9.5px; color: #333333; }
    .acceptance .decision-approved { font-size: 10.5px; color: #15803d; font-weight: bold; }
    .acceptance .decision-rejected { font-size: 10.5px; color: #b91c1c; font-weight: bold; }

    .signature-row { margin-top: 26px; }
    .signature-row table { width: 100%; }
    .signature-row td { width: 50%; padding-top: 26px; border-top: 1px solid #333333; font-size: 8.5px; color: #444444; }
</style>
</head>
<body>

<div class="header">
    <table>
        <tr>
            @if ($data->company['logo_data_uri'])
                <td class="logo-cell">
                    <img src="{{ $data->company['logo_data_uri'] }}" alt="Logo">
                </td>
            @endif
            <td class="identity-cell">
                <div class="company-name">{{ $data->company['trade_name'] ?: $data->company['name'] }}</div>
                @if ($data->company['legal_name'])
                    <div class="company-line">{{ $data->company['legal_name'] }}</div>
                @endif
                @if ($data->company['document'])
                    <div class="company-line">CNPJ {{ $data->company['document'] }}</div>
                @endif
                @if ($data->company['phone'] || $data->company['whatsapp'])
                    <div class="company-line">
                        {{ implode(' · ', array_filter([$data->company['phone'], $data->company['whatsapp']])) }}
                    </div>
                @endif
                @if ($data->company['email'])
                    <div class="company-line">{{ $data->company['email'] }}</div>
                @endif
                @if (count($data->company['address_lines']) > 0)
                    <div class="company-line">{{ implode(' · ', $data->company['address_lines']) }}</div>
                @endif
            </td>
        </tr>
    </table>
</div>

<h1 class="doc-title">PROPOSTA COMERCIAL</h1>
<div class="doc-meta">
    {{ $data->number }} &nbsp;·&nbsp;
    @if ($data->isPreview)
        <span class="preview-flag">{{ $data->issuedAtLabel }}</span>
    @else
        Emitida em {{ $data->issuedAtLabel }}
    @endif
    @if ($data->validUntilLabel)
        &nbsp;·&nbsp; Válida até {{ $data->validUntilLabel }}
    @endif
</div>

<div class="section-title">Cliente</div>
<div>{{ $data->customerName }}</div>

<div class="section-title">Escopo</div>
<div>{{ $data->title }}</div>
@if ($data->reference)
    <div style="font-size: 9.5px; color: #444444;">{{ $data->reference }}</div>
@endif

<div class="section-title">Itens</div>
<table class="items">
    <thead>
        <tr>
            <th>Descrição</th>
            <th class="num">Qtd.</th>
            <th>Un.</th>
            <th class="num">Preço unit.</th>
            <th class="num">Desconto</th>
            <th class="num">Total</th>
        </tr>
    </thead>
    <tbody>
        @foreach ($data->items as $item)
            <tr>
                <td>
                    {{ $item['name'] }}
                    @if (! empty($item['description']))
                        <div class="item-description">{{ $item['description'] }}</div>
                    @endif
                </td>
                <td class="num">{{ $item['quantity'] }}</td>
                <td>{{ $item['unit'] ?? '—' }}</td>
                <td class="num">{{ $item['unit_price'] }}</td>
                <td class="num">{{ $item['line_discount'] }}</td>
                <td class="num">{{ $item['line_total'] }}</td>
            </tr>
        @endforeach
        @if (count($data->items) === 0)
            <tr><td colspan="6" style="color: #888888;">Nenhum item adicionado.</td></tr>
        @endif
    </tbody>
</table>

<table class="summary">
    <tr>
        <td class="label">Subtotal</td>
        <td class="value">{{ $data->saleSubtotalLabel }}</td>
    </tr>
    @if ($data->discountAmountLabel)
        <tr>
            <td class="label">Desconto</td>
            <td class="value">-{{ $data->discountAmountLabel }}</td>
        </tr>
    @endif
    <tr class="total">
        <td class="label">Total</td>
        <td class="value">{{ $data->totalLabel }}</td>
    </tr>
</table>

@if ($data->paymentTerms || $data->executionTerms || $data->proposalTerms)
    <div class="section-title">Condições</div>
    @if ($data->paymentTerms)
        <div class="conditions-block">
            <div class="label">Condições de pagamento</div>
            <div class="text">{{ $data->paymentTerms }}</div>
        </div>
    @endif
    @if ($data->executionTerms)
        <div class="conditions-block">
            <div class="label">Prazo e condições de execução</div>
            <div class="text">{{ $data->executionTerms }}</div>
        </div>
    @endif
    @if ($data->proposalTerms)
        <div class="conditions-block">
            <div class="label">Condições gerais</div>
            <div class="text">{{ $data->proposalTerms }}</div>
        </div>
    @endif
@endif

<div class="acceptance">
    <div class="title">Aceite da proposta</div>

    @if ($data->decision['status'] === 'approved')
        <div class="decision-approved">{{ $data->decision['approved_label'] }}</div>
    @elseif ($data->decision['status'] === 'rejected')
        <div class="decision-rejected">{{ $data->decision['rejected_label'] }}</div>
    @else
        <div class="notice">{{ $data->decision['pending_notice'] }}</div>
        <div class="signature-row">
            <table>
                <tr>
                    <td>Nome</td>
                    <td style="padding-left: 20px;">Data</td>
                </tr>
            </table>
        </div>
        <div class="signature-row">
            <table>
                <tr>
                    <td colspan="2">Assinatura</td>
                </tr>
            </table>
        </div>
    @endif
</div>

</body>
</html>
