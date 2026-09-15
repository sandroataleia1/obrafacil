"use client";

/**
 * §36-39 EDIT HEADER — /orcamentos/{id}/editar, draft ONLY. Full PUT
 * with customer_id/title/reference/notes/discount_amount — items are
 * never touched here (they have their own dialogs on the Detail page).
 *
 * §37 DIRECT EDIT TERMINAL/PENDING — visiting this route for a Budget
 * that is no longer draft shows a readonly block message and issues
 * ZERO PUT.
 *
 * §39 HEADER 409 — another actor submitted the Budget while this form
 * was open: the PUT 409s, we refetch, and show the "can no longer be
 * edited" message. No automatic retry.
 *
 * FRONTEND-BUDGETS-01A §13-18: visual tenant fail-closed, mirroring
 * `BudgetDetail`'s already-approved pattern field-for-field —
 * `loadedCompanyId`/`resolvedCompanyId` are the render-gating source of
 * truth (recomputed every render directly from state, so a Company
 * switch hides Company A's values in the SAME render, never a frame
 * later), while `activeCompanyIdRef`/`requestSequence`/`isStaleRequest`
 * remain the async-continuation guards for the in-flight GET/PUT.
 * `isCurrentTenant` gates the editable form (only true once a budget is
 * loaded AND it belongs to the currently active Company);
 * `isResolvedForCurrentTenant` gates the terminal error/not_found
 * screens the same way, so an error that belongs to a Company the user
 * has since left never renders under the new one — the fallback is
 * always the skeleton, never an infinite one (a switch always
 * re-triggers `loadBudget()` for the new Company).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { BackLink } from "@/components/shared/back-link";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import type { Customer, CustomerListItem } from "@/features/customers/types";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { brlInputToDecimalString, decimalStringToMoneyInputValue } from "@/lib/currency";
import { BudgetCustomerPicker } from "./components/budget-customer-picker";
import { getBudget, updateBudget } from "./budgets-client";
import type { Budget } from "./types";

export function EditBudgetHeaderForm({ id }: { id: string }) {
  const router = useRouter();

  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  // §13: synchronous, pre-paint — the instant `activeCompanyId` commits
  // to a new value, `.current` reflects it before any async continuation
  // (a PUT/GET callback from the OLD Company) gets a chance to read it,
  // mirroring the same guarantee `BudgetForm`'s wrapper already relies on.
  // A plain `useEffect` here left a window where a PUT for A resolving
  // right after a switch to B could still read `activeCompanyIdRef.current
  // === undefined`/stale before the effect had run.
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);
  const isStaleRequest = useCallback(
    (requestCompanyId: string | undefined) => activeCompanyIdRef.current !== requestCompanyId,
    []
  );

  const [status, setStatus] = useState<"loading" | "success" | "error" | "not_found">("loading");
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | undefined>(undefined);
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | undefined>(undefined);

  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState<CustomerListItem | Customer | null>(null);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [discountInput, setDiscountInput] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const requestSequence = useRef(0);

  const loadBudget = useCallback((options?: { keepConflict?: boolean }) => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    setStatus("loading");
    setBudget(null);
    setFieldErrors({});
    setError(null);
    // The 409 handler below sets `conflict=true` and then calls this
    // SAME function to refetch — without `keepConflict`, this reset
    // would immediately wipe the flag it just set (both run in the same
    // tick), silently swapping the "alterado" message for the generic
    // "já foi disponibilizado" one. A genuinely fresh load (mount, a
    // Company switch, or the "Tentar novamente" retry) always wants the
    // reset, so this only opts out for that one internal call site.
    if (!options?.keepConflict) setConflict(false);
    setSubmitting(false);
    getBudget(id)
      .then((found) => {
        if (requestSequence.current !== requestId) return;
        if (isStaleRequest(requestCompanyId)) return;
        setBudget(found);
        setLoadedCompanyId(requestCompanyId);
        setResolvedCompanyId(requestCompanyId);
        setTitle(found.title);
        setCustomer({
          id: found.customer_id,
          name: found.customer.name,
          document: found.customer.document,
          phone: found.customer.phone,
          email: found.customer.email,
        } as CustomerListItem);
        setReference(found.reference ?? "");
        setNotes(found.notes ?? "");
        setDiscountInput(decimalStringToMoneyInputValue(found.discount_amount));
        setStatus("success");
      })
      .catch((caught) => {
        if (requestSequence.current !== requestId) return;
        if (isStaleRequest(requestCompanyId)) return;
        setResolvedCompanyId(requestCompanyId);
        if (caught instanceof ApiError && caught.status === 404) {
          setStatus("not_found");
        } else {
          setStatus("error");
        }
      });
  }, [id, activeCompanyId, isStaleRequest]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBudget();
  }, [loadBudget]);

  // §14/§15: recomputed fresh every render directly from state — the
  // instant `activeCompanyId` changes (a Company switch), this goes
  // false in that SAME render, before any effect has a chance to run,
  // so the skeleton branch below takes over immediately rather than
  // ever painting Company A's loaded values under B.
  const isCurrentTenant = budget !== null && loadedCompanyId === activeCompanyId;
  const isResolvedForCurrentTenant = resolvedCompanyId !== undefined && resolvedCompanyId === activeCompanyId;

  const canSubmit = title.trim() !== "" && customer !== null && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !customer) return;

    const requestCompanyId = activeCompanyId;
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    setConflict(false);

    try {
      const updated = await updateBudget(id, {
        customer_id: customer.id,
        title: title.trim(),
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        discount_amount: brlInputToDecimalString(discountInput) ?? "0.00",
      });
      // §17: a PUT for A resolving after a switch to B must never
      // navigate, never surface its error, and never touch B's own
      // `submitting` state — the `finally` guard below covers that
      // last part; this early return covers success.
      if (isStaleRequest(requestCompanyId)) return;
      router.push(`/orcamentos/${updated.id}`);
    } catch (caught) {
      if (isStaleRequest(requestCompanyId)) return;

      if (caught instanceof ApiValidationError) {
        setFieldErrors(caught.errors);
        setError("Verifique os campos destacados.");
      } else if (caught instanceof ApiError && caught.status === 409) {
        setConflict(true);
        loadBudget({ keepConflict: true });
      } else if (caught instanceof ApiError) {
        setError(caught.message || "Não foi possível salvar as alterações.");
      } else {
        setError("Não foi possível salvar. Verifique sua conexão e tente novamente.");
      }
    } finally {
      if (!isStaleRequest(requestCompanyId)) setSubmitting(false);
    }
  }

  if (status === "error" && isResolvedForCurrentTenant) {
    return (
      <div className="space-y-6">
        <BackLink href="/orcamentos" title="Erro ao carregar" />
        <p className="text-sm text-destructive">Não foi possível carregar este orçamento.</p>
        <Button type="button" variant="outline" onClick={() => loadBudget()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (status === "not_found" && isResolvedForCurrentTenant) {
    return (
      <div className="space-y-6">
        <BackLink href="/orcamentos" title="Editar orçamento" />
        <EmptyState icon={FileText} title="Orçamento não encontrado" description="Ele pode ter sido removido ou o link está incorreto." />
      </div>
    );
  }

  // §16/§18: covers the initial load, a Company switch (isCurrentTenant
  // goes false immediately), and the "resolved under a different
  // Company" gap for error/not_found above — never an infinite
  // skeleton, since a switch always re-fires `loadBudget()` for the new
  // Company via the effect above.
  if (!isCurrentTenant || status === "loading" || !budget) {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <span className="sr-only">Carregando orçamento</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  // §37: a Budget that is no longer draft is blocked from editing even
  // if the user navigates here directly — ZERO PUT is ever attempted.
  // §39: if we got here because a concurrent PUT 409'd and we refetched,
  // show the conflict-specific wording instead of the generic §37 one.
  if (budget.status !== "draft") {
    return (
      <div className="space-y-6">
        <BackLink href={`/orcamentos/${id}`} title="Orçamento" />
        <p className="text-sm text-muted-foreground">
          {conflict
            ? "O orçamento foi alterado e não pode mais ser editado."
            : "Este orçamento já foi disponibilizado e não pode mais ser editado."}
        </p>
        <Button type="button" variant="outline" onClick={() => router.push(`/orcamentos/${id}`)}>
          Voltar ao orçamento
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink href={`/orcamentos/${id}`} title="Editar orçamento" />

      {conflict ? (
        <p className="text-sm text-destructive">
          O orçamento foi alterado e não pode mais ser editado.
        </p>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="edit-budget-title" className="text-sm font-medium text-foreground">
            Título
          </label>
          <input
            id="edit-budget-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldErrors.title ? <p className="text-sm text-destructive">{fieldErrors.title[0]}</p> : null}
        </div>

        <BudgetCustomerPicker
          selected={customer}
          onSelect={setCustomer}
          requestCompanyId={activeCompanyId}
          isStaleRequest={isStaleRequest}
        />
        {fieldErrors.customer_id ? <p className="text-sm text-destructive">{fieldErrors.customer_id[0]}</p> : null}

        <div className="space-y-1.5">
          <label htmlFor="edit-budget-reference" className="text-sm font-medium text-foreground">
            Referência <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="edit-budget-reference"
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Casa de praia, Loja Centro, Reforma 2º andar"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldErrors.reference ? <p className="text-sm text-destructive">{fieldErrors.reference[0]}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-budget-notes" className="text-sm font-medium text-foreground">
            Observações <span className="text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            id="edit-budget-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldErrors.notes ? <p className="text-sm text-destructive">{fieldErrors.notes[0]}</p> : null}
        </div>

        <MoneyField id="edit-budget-discount" label="Desconto global" value={discountInput} onChange={setDiscountInput} />
        {fieldErrors.discount_amount ? <p className="text-sm text-destructive">{fieldErrors.discount_amount[0]}</p> : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <Button type="button" size="lg" onClick={handleSubmit} disabled={!canSubmit} className="w-full">
        {submitting ? "Salvando..." : "Salvar alterações"}
      </Button>
    </div>
  );
}
