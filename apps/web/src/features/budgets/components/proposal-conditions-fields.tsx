"use client";

/**
 * PROPOSAL-DOC-01B §14-23: the shared "Condições da proposta" section —
 * `valid_until`/`payment_terms`/`execution_terms`/`proposal_terms` — used
 * identically by `BudgetForm` (create) and `EditBudgetHeaderForm` (edit,
 * draft-only). A plain controlled-inputs component, not a new form
 * framework (§23) — the parent owns all state and payload assembly.
 */

interface ProposalConditionsFieldsProps {
  validUntil: string;
  onValidUntilChange: (value: string) => void;
  paymentTerms: string;
  onPaymentTermsChange: (value: string) => void;
  executionTerms: string;
  onExecutionTermsChange: (value: string) => void;
  proposalTerms: string;
  onProposalTermsChange: (value: string) => void;
  fieldErrors: Record<string, string[]>;
  idPrefix: string;
}

export function ProposalConditionsFields({
  validUntil,
  onValidUntilChange,
  paymentTerms,
  onPaymentTermsChange,
  executionTerms,
  onExecutionTermsChange,
  proposalTerms,
  onProposalTermsChange,
  fieldErrors,
  idPrefix,
}: ProposalConditionsFieldsProps) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Condições da proposta</h2>
        <p className="text-xs text-muted-foreground">Aparecem para o cliente na proposta. Todos os campos são opcionais.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-valid-until`} className="text-sm font-medium text-foreground">
          Validade <span className="text-muted-foreground">(opcional)</span>
        </label>
        <input
          id={`${idPrefix}-valid-until`}
          type="date"
          value={validUntil}
          onChange={(event) => onValidUntilChange(event.target.value)}
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
        {fieldErrors.valid_until ? <p className="text-sm text-destructive">{fieldErrors.valid_until[0]}</p> : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-payment-terms`} className="text-sm font-medium text-foreground">
          Condições de pagamento <span className="text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          id={`${idPrefix}-payment-terms`}
          value={paymentTerms}
          onChange={(event) => onPaymentTermsChange(event.target.value)}
          rows={2}
          placeholder="50% na aprovação e 50% na conclusão."
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
        {fieldErrors.payment_terms ? <p className="text-sm text-destructive">{fieldErrors.payment_terms[0]}</p> : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-execution-terms`} className="text-sm font-medium text-foreground">
          Prazo e condições de execução <span className="text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          id={`${idPrefix}-execution-terms`}
          value={executionTerms}
          onChange={(event) => onExecutionTermsChange(event.target.value)}
          rows={2}
          placeholder="Início em até 10 dias úteis após aprovação."
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
        {fieldErrors.execution_terms ? <p className="text-sm text-destructive">{fieldErrors.execution_terms[0]}</p> : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-proposal-terms`} className="text-sm font-medium text-foreground">
          Condições gerais <span className="text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          id={`${idPrefix}-proposal-terms`}
          value={proposalTerms}
          onChange={(event) => onProposalTermsChange(event.target.value)}
          rows={2}
          placeholder="Materiais não previstos serão orçados separadamente."
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
        {fieldErrors.proposal_terms ? <p className="text-sm text-destructive">{fieldErrors.proposal_terms[0]}</p> : null}
      </div>
    </section>
  );
}
