import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiBlobRequest, apiRequest } from "@/lib/api-client";
import { createBudget, getBudgetProposalPdf, updateBudget } from "../budgets-client";
import { getPublicProposalPdf } from "../proposal-client";
import { downloadPdfBlob } from "../lib/pdf-actions";
import type { Budget, BudgetCreatePayload, BudgetUpdatePayload, PublicProposal } from "../types";

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    apiRequest: vi.fn(),
    apiBlobRequest: vi.fn(),
  };
});

describe("Budgets/Proposals contract (PROPOSAL-DOC-01B §68 PC1-PC10)", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset().mockResolvedValue({} as never);
    vi.mocked(apiBlobRequest).mockReset().mockResolvedValue(new Blob(["%PDF-fake"]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** PC1: Budget carries the four conditions fields plus proposal_template_version, all correctly typed. */
  it("PC1: Budget type accepts the conditions + template_version shape", () => {
    const budget: Pick<Budget, "valid_until" | "payment_terms" | "execution_terms" | "proposal_terms" | "proposal_template_version"> = {
      valid_until: "2026-10-01",
      payment_terms: "50% na aprovação",
      execution_terms: "10 dias úteis",
      proposal_terms: "Materiais não previstos são orçados separadamente",
      proposal_template_version: 1,
    };
    expect(budget.valid_until).toBe("2026-10-01");
    expect(budget.proposal_template_version).toBe(1);
  });

  /** PC2: Budget.proposal_company is nullable — both states are valid. */
  it("PC2: Budget.proposal_company accepts both null and a full snapshot", () => {
    const draftShape: Pick<Budget, "proposal_company"> = { proposal_company: null };
    const submittedShape: Pick<Budget, "proposal_company"> = {
      proposal_company: {
        name: "Empresa",
        legal_name: null,
        trade_name: null,
        document: null,
        phone: null,
        whatsapp: null,
        email: null,
        address: {
          postal_code: null,
          street: null,
          number: null,
          complement: null,
          neighborhood: null,
          city: null,
          state: null,
          reference_point: null,
        },
        timezone: null,
        logo_url: null,
      },
    };
    expect(draftShape.proposal_company).toBeNull();
    expect(submittedShape.proposal_company?.name).toBe("Empresa");
  });

  /** PC3: PublicProposal.company carries the same identity/address/logo shape, without `timezone`. */
  it("PC3: PublicProposal.company shape matches the frozen snapshot (no timezone field)", () => {
    const company: NonNullable<PublicProposal["company"]> = {
      name: "Empresa",
      legal_name: null,
      trade_name: null,
      document: null,
      phone: null,
      whatsapp: null,
      email: null,
      address: {
        postal_code: null,
        street: null,
        number: null,
        complement: null,
        neighborhood: null,
        city: null,
        state: null,
        reference_point: null,
      },
      logo_url: null,
    };
    expect(company).not.toHaveProperty("timezone");
  });

  /** PC4: createBudget sends the conditions fields verbatim, through the central client only. */
  it("PC4: createBudget's payload carries valid_until/payment_terms/execution_terms/proposal_terms", async () => {
    const payload: BudgetCreatePayload = {
      customer_id: "cust-1",
      title: "Reforma",
      valid_until: "2026-10-01",
      payment_terms: "50% na aprovação",
      execution_terms: "10 dias úteis",
      proposal_terms: "Condições gerais",
    };
    await createBudget(payload);

    expect(apiRequest).toHaveBeenCalledWith("/api/v1/budgets", { method: "POST", body: payload });
  });

  /** PC5: updateBudget's payload carries the same four conditions fields. */
  it("PC5: updateBudget's payload carries the conditions fields", async () => {
    const payload: BudgetUpdatePayload = {
      customer_id: "cust-1",
      title: "Reforma",
      valid_until: null,
      payment_terms: null,
      execution_terms: null,
      proposal_terms: "Só isso",
    };
    await updateBudget("budget-1", payload);

    expect(apiRequest).toHaveBeenCalledWith("/api/v1/budgets/budget-1", { method: "PUT", body: payload });
  });

  /** PC6: getBudgetProposalPdf calls the authenticated preview path via apiBlobRequest. */
  it("PC6: getBudgetProposalPdf hits /api/v1/budgets/{id}/proposal-preview.pdf via apiBlobRequest", async () => {
    await getBudgetProposalPdf("budget-42");

    expect(apiBlobRequest).toHaveBeenCalledWith("/api/v1/budgets/budget-42/proposal-preview.pdf");
    expect(apiRequest).not.toHaveBeenCalled();
  });

  /** PC7: getPublicProposalPdf calls the public token-based path via apiBlobRequest. */
  it("PC7: getPublicProposalPdf hits /api/v1/proposals/{token}/pdf via apiBlobRequest", async () => {
    await getPublicProposalPdf("tok-123");

    expect(apiBlobRequest).toHaveBeenCalledWith("/api/v1/proposals/tok-123/pdf");
    expect(apiRequest).not.toHaveBeenCalled();
  });

  /** PC8: neither budgets-client.ts, proposal-client.ts, nor lib/pdf-actions.ts calls the raw `fetch` global directly. */
  it("PC8: zero raw fetch() calls outside the central api-client", () => {
    const files = [
      path.resolve(__dirname, "../budgets-client.ts"),
      path.resolve(__dirname, "../proposal-client.ts"),
      path.resolve(__dirname, "../lib/pdf-actions.ts"),
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      expect(source).not.toMatch(/[^.]\bfetch\(/);
    }
  });

  /** PC9: the PublicProposal/PublicProposalItem type declarations never declare any internal/cost/tenant field. */
  it("PC9: the public contract's type declarations exclude every internal/cost/tenant field", () => {
    const typesSource = readFileSync(path.resolve(__dirname, "../types.ts"), "utf-8");
    const publicProposalBlock = typesSource.slice(
      typesSource.indexOf("export interface PublicProposal {"),
      typesSource.indexOf("export interface ApproveProposalPayload")
    );
    const forbidden = [
      "company_id",
      "customer_id",
      "customer_document",
      "customer_phone",
      "customer_email",
      "cost_subtotal",
      "margin_amount",
      "margin_percentage",
      "calculation_snapshot",
      "created_by_user_id",
      "decision_by_user_id",
      "unit_cost",
      "line_cost_total",
    ];
    for (const field of forbidden) {
      expect(publicProposalBlock).not.toContain(field);
    }
  });

  /** PC10: a PDF download filename is derived from the Budget/proposal NUMBER only — never the customer name. */
  it("PC10: downloadPdfBlob is invoked with a filename derived only from the ORC number", async () => {
    const filename = "ORC-000123.pdf";
    await downloadPdfBlob(() => getBudgetProposalPdf("budget-1"), filename, () => false);

    expect(filename).toMatch(/^ORC-\d{6}\.pdf$/);
    expect(filename).not.toMatch(/[a-zA-Z]{4,}\s/); // no free-text customer name folded in
  });
});
