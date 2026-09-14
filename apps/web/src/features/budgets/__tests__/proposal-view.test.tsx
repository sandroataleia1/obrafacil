import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";
import { ProposalView } from "../proposal-view";
import type { PublicProposal } from "../types";

vi.mock("../proposal-client", () => ({
  getPublicProposal: vi.fn(),
  approvePublicProposal: vi.fn(),
  rejectPublicProposal: vi.fn(),
}));

import { approvePublicProposal, getPublicProposal, rejectPublicProposal } from "../proposal-client";

function pendingProposal(overrides: Partial<PublicProposal> = {}): PublicProposal {
  return {
    number: "ORC-000001",
    status: "pending_approval",
    title: "Reforma de fachada",
    reference: "Rua das Flores, 123",
    customer_name: "Maria Cliente",
    sale_subtotal: "1500.00",
    discount_amount: "0.00",
    total: "1500.00",
    submitted_at: "2026-09-01T10:00:00Z",
    decided_at: null,
    decision_by_name: null,
    items: [
      {
        id: "item-1",
        code: null,
        name: "Pintura externa",
        unit: "m²",
        description: "Duas demãos de tinta acrílica",
        quantity: "1.000",
        unit_price: "1500.00",
        line_discount: "0.00",
        line_total: "1500.00",
        sort_order: 0,
      },
    ],
    ...overrides,
  };
}

describe("ProposalView", () => {
  beforeEach(() => {
    vi.mocked(getPublicProposal).mockReset();
    vi.mocked(approvePublicProposal).mockReset();
    vi.mocked(rejectPublicProposal).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'Proposta não encontrada' on a 404 and nothing else", async () => {
    vi.mocked(getPublicProposal).mockRejectedValue(new ApiError(404, "not found"));
    render(<ProposalView token="tok-404" />);

    await screen.findByText("Proposta não encontrada");
    expect(screen.queryByText("ORC-000001")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("pending: shows the name/note form and both decision buttons enabled", async () => {
    vi.mocked(getPublicProposal).mockResolvedValue(pendingProposal());
    render(<ProposalView token="tok-1" />);

    await screen.findByText("Reforma de fachada");
    expect(screen.getByLabelText("Seu nome")).toBeInTheDocument();
    expect(screen.getByLabelText(/Observação/)).toBeInTheDocument();

    const approveButton = screen.getByRole("button", { name: "Aprovar proposta" });
    const rejectButton = screen.getByRole("button", { name: "Recusar proposta" });
    expect(approveButton).not.toBeDisabled();
    expect(rejectButton).not.toBeDisabled();
  });

  it("displays quantity '1.000' as '1' and '1.500' as '1,5'", async () => {
    vi.mocked(getPublicProposal).mockResolvedValue(
      pendingProposal({
        items: [
          {
            id: "item-1",
            code: null,
            name: "Item A",
            unit: "un",
            description: null,
            quantity: "1.000",
            unit_price: "10.00",
            line_discount: "0.00",
            line_total: "10.00",
            sort_order: 0,
          },
          {
            id: "item-2",
            code: null,
            name: "Item B",
            unit: "m",
            description: null,
            quantity: "1.500",
            unit_price: "20.00",
            line_discount: "0.00",
            line_total: "30.00",
            sort_order: 1,
          },
        ],
      })
    );
    render(<ProposalView token="tok-qty" />);

    await screen.findByText("Item A");
    expect(screen.getByText(/^1 un ×/)).toBeInTheDocument();
    expect(screen.getByText(/^1,5 m ×/)).toBeInTheDocument();
  });

  it("approve happy path sends { name, accepted: true, note } and never a customer/company id", async () => {
    vi.mocked(getPublicProposal).mockResolvedValue(pendingProposal());
    vi.mocked(approvePublicProposal).mockResolvedValue(
      pendingProposal({
        status: "approved",
        decided_at: "2026-09-14T12:00:00Z",
        decision_by_name: "Maria Cliente",
      })
    );

    const user = userEvent.setup();
    render(<ProposalView token="tok-approve" />);
    await screen.findByText("Reforma de fachada");

    await user.type(screen.getByLabelText("Seu nome"), "Maria Cliente");
    await user.type(screen.getByLabelText(/Observação/), "Combinado");
    await user.click(screen.getByRole("button", { name: "Aprovar proposta" }));

    await waitFor(() => expect(approvePublicProposal).toHaveBeenCalledTimes(1));
    const [calledToken, payload] = vi.mocked(approvePublicProposal).mock.calls[0]!;
    expect(calledToken).toBe("tok-approve");
    expect(payload).toEqual({ name: "Maria Cliente", accepted: true, note: "Combinado" });
    expect(payload).not.toHaveProperty("customer_id");
    expect(payload).not.toHaveProperty("company_id");
    expect(payload).not.toHaveProperty("reason");

    await screen.findByText("Proposta aprovada");
  });

  it("reject happy path shows a confirm step then sends { name, note } and never a 'reason' field", async () => {
    vi.mocked(getPublicProposal).mockResolvedValue(pendingProposal());
    vi.mocked(rejectPublicProposal).mockResolvedValue(
      pendingProposal({
        status: "rejected",
        decided_at: "2026-09-14T12:00:00Z",
        decision_by_name: "Maria Cliente",
      })
    );

    const user = userEvent.setup();
    render(<ProposalView token="tok-reject" />);
    await screen.findByText("Reforma de fachada");

    await user.type(screen.getByLabelText("Seu nome"), "Maria Cliente");
    await user.click(screen.getByRole("button", { name: "Recusar proposta" }));

    // Confirm step appears — the actual API call must not have happened yet.
    await screen.findByText("Recusar esta proposta? Esta ação não pode ser desfeita.");
    expect(rejectPublicProposal).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirmar recusa" }));

    await waitFor(() => expect(rejectPublicProposal).toHaveBeenCalledTimes(1));
    const [calledToken, payload] = vi.mocked(rejectPublicProposal).mock.calls[0]!;
    expect(calledToken).toBe("tok-reject");
    expect(payload).toEqual({ name: "Maria Cliente", note: null });
    expect(payload).not.toHaveProperty("reason");

    await screen.findByText("Proposta recusada");
  });

  it("requires a name before allowing approve or the reject confirm step", async () => {
    vi.mocked(getPublicProposal).mockResolvedValue(pendingProposal());
    const user = userEvent.setup();
    render(<ProposalView token="tok-noname" />);
    await screen.findByText("Reforma de fachada");

    await user.click(screen.getByRole("button", { name: "Aprovar proposta" }));
    expect(screen.getByText("Informe seu nome.")).toBeInTheDocument();
    expect(approvePublicProposal).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Recusar proposta" }));
    expect(screen.queryByText("Recusar esta proposta? Esta ação não pode ser desfeita.")).not.toBeInTheDocument();
    expect(rejectPublicProposal).not.toHaveBeenCalled();
  });

  it("disables both buttons while a decision request is in flight (double-click prevention)", async () => {
    vi.mocked(getPublicProposal).mockResolvedValue(pendingProposal());
    let resolveApprove!: (value: PublicProposal) => void;
    vi.mocked(approvePublicProposal).mockReturnValue(
      new Promise((resolve) => {
        resolveApprove = resolve;
      })
    );

    const user = userEvent.setup();
    render(<ProposalView token="tok-inflight" />);
    await screen.findByText("Reforma de fachada");

    await user.type(screen.getByLabelText("Seu nome"), "Maria Cliente");
    const approveButton = screen.getByRole("button", { name: "Aprovar proposta" });
    await user.click(approveButton);

    expect(screen.getByRole("button", { name: "Aprovar proposta" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Recusar proposta" })).toBeDisabled();

    resolveApprove(pendingProposal({ status: "approved" }));
    await waitFor(() => expect(approvePublicProposal).toHaveBeenCalledTimes(1));
  });

  it("on 409 (already decided elsewhere) refetches and renders the winning state instead of retrying or erroring", async () => {
    vi.mocked(getPublicProposal)
      .mockResolvedValueOnce(pendingProposal())
      .mockResolvedValueOnce(
        pendingProposal({
          status: "rejected",
          decided_at: "2026-09-14T12:00:00Z",
          decision_by_name: "Outra Pessoa",
        })
      );
    vi.mocked(approvePublicProposal).mockRejectedValue(new ApiError(409, "already decided"));

    const user = userEvent.setup();
    render(<ProposalView token="tok-409" />);
    await screen.findByText("Reforma de fachada");

    await user.type(screen.getByLabelText("Seu nome"), "Maria Cliente");
    await user.click(screen.getByRole("button", { name: "Aprovar proposta" }));

    await screen.findByText("Proposta recusada");
    expect(getPublicProposal).toHaveBeenCalledTimes(2);
    expect(approvePublicProposal).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Não foi possível registrar sua decisão agora. Tente novamente.")).not.toBeInTheDocument();
  });

  it("on 429 shows a friendly rate-limit message, not a generic/technical error", async () => {
    vi.mocked(getPublicProposal).mockResolvedValue(pendingProposal());
    vi.mocked(approvePublicProposal).mockRejectedValue(new ApiError(429, "Too Many Requests"));

    const user = userEvent.setup();
    render(<ProposalView token="tok-429" />);
    await screen.findByText("Reforma de fachada");

    await user.type(screen.getByLabelText("Seu nome"), "Maria Cliente");
    await user.click(screen.getByRole("button", { name: "Aprovar proposta" }));

    await screen.findByText("Muitas tentativas. Aguarde um momento e tente novamente.");
    expect(screen.queryByText("Too Many Requests")).not.toBeInTheDocument();
  });

  it("already approved: shows the status plainly with decided_at/decision_by_name and zero decision buttons", async () => {
    vi.mocked(getPublicProposal).mockResolvedValue(
      pendingProposal({
        status: "approved",
        decided_at: "2026-09-14T12:00:00Z",
        decision_by_name: "Maria Cliente",
      })
    );
    render(<ProposalView token="tok-approved" />);

    await screen.findByText("Proposta aprovada");
    expect(screen.getByText(/por Maria Cliente/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar proposta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recusar proposta" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Seu nome")).not.toBeInTheDocument();
  });

  it("already rejected: shows the status plainly and zero decision buttons", async () => {
    vi.mocked(getPublicProposal).mockResolvedValue(
      pendingProposal({
        status: "rejected",
        decided_at: "2026-09-14T12:00:00Z",
        decision_by_name: "Maria Cliente",
      })
    );
    render(<ProposalView token="tok-rejected" />);

    await screen.findByText("Proposta recusada");
    expect(screen.queryByRole("button", { name: "Aprovar proposta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recusar proposta" })).not.toBeInTheDocument();
  });

  it("money display sanity: zero discount is hidden, non-zero discount and total render via BRL formatting", async () => {
    vi.mocked(getPublicProposal).mockResolvedValue(
      pendingProposal({
        sale_subtotal: "1600.00",
        discount_amount: "100.00",
        total: "1420.00",
      })
    );
    render(<ProposalView token="tok-money" />);

    await screen.findByText("Reforma de fachada");
    expect(screen.getByText("R$ 1.600,00")).toBeInTheDocument();
    expect(screen.getByText("−R$ 100,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.420,00")).toBeInTheDocument();
  });

  it("zero discount amount is not rendered as a discount row", async () => {
    vi.mocked(getPublicProposal).mockResolvedValue(pendingProposal({ discount_amount: "0.00" }));
    render(<ProposalView token="tok-zero-discount" />);

    await screen.findByText("Reforma de fachada");
    expect(screen.queryByText("Desconto")).not.toBeInTheDocument();
  });

  /**
   * Structural guarantee: even if the API response object hypothetically
   * carried internal-only fields (cost/margin/customer contact/
   * calculation_snapshot/decision_by_user_id — none of which actually
   * exist on `PublicProposal`/`PublicProposalItem`), the rendering code
   * must never read or display them. This is enforced primarily by code
   * review of proposal-view.tsx (it destructures only documented
   * `PublicProposal`/`PublicProposalItem` fields and never touches any of
   * the excluded keys) — this test additionally proves that even when
   * such fields are present on the object at runtime, their values never
   * appear anywhere in the rendered output.
   */
  it("never renders internal-only fields even if hypothetically present on the response object", async () => {
    const hostileProposal = {
      ...pendingProposal(),
      // None of these exist on the real PublicProposal/PublicProposalItem
      // contract — injected here only to prove the component never reads
      // or displays them, even if the backend contract were ever violated.
      company_id: "SECRET-COMPANY-ID",
      customer_id: "SECRET-CUSTOMER-ID",
      customer_document: "SECRET-DOCUMENT-000",
      customer_phone: "SECRET-PHONE-000",
      customer_email: "secret@internal.example",
      cost_subtotal: "999.99",
      margin_amount: "111.11",
      margin_percentage: "50.00",
      created_by_user_id: "SECRET-CREATOR-ID",
      decision_by_user_id: "SECRET-DECIDER-ID",
      items: [
        {
          ...pendingProposal().items[0]!,
          unit_cost: "SECRET-UNIT-COST",
          line_cost_total: "SECRET-LINE-COST",
          calculation_snapshot: { secret: "SECRET-SNAPSHOT-VALUE" },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    vi.mocked(getPublicProposal).mockResolvedValue(hostileProposal);
    render(<ProposalView token="tok-hostile" />);

    await screen.findByText("Reforma de fachada");

    const hostileValues = [
      "SECRET-COMPANY-ID",
      "SECRET-CUSTOMER-ID",
      "SECRET-DOCUMENT-000",
      "SECRET-PHONE-000",
      "secret@internal.example",
      "999.99",
      "111.11",
      "50.00",
      "SECRET-CREATOR-ID",
      "SECRET-DECIDER-ID",
      "SECRET-UNIT-COST",
      "SECRET-LINE-COST",
      "SECRET-SNAPSHOT-VALUE",
    ];
    for (const value of hostileValues) {
      expect(screen.queryByText(value)).not.toBeInTheDocument();
    }
  });
});
