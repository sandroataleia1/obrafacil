import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
);

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/customers/customers-client", () => ({
  createCustomer: vi.fn(),
  lookupCnpj: vi.fn(),
  lookupCep: vi.fn(),
}));

import { createCustomer, lookupCnpj, lookupCep } from "@/features/customers/customers-client";
import { QuickCustomerDialog } from "../quick-customer-dialog";

describe("QuickCustomerDialog", () => {
  beforeEach(() => {
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("QC1: submits Customer + exactly one address in a single atomic POST", async () => {
    vi.mocked(createCustomer).mockResolvedValue({ id: "cust-1", name: "João" } as never);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={onCreated} />);

    await user.type(screen.getByLabelText("Nome"), "João Pereira");
    await user.click(screen.getByRole("button", { name: /criar cliente/i }));

    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createCustomer).mock.calls[0]![0];
    expect(payload.addresses).toHaveLength(1);
    expect(payload.contacts).toBeUndefined();
  });

  it("QC2: calls onCreated with the response on success", async () => {
    const created = { id: "cust-1", name: "João" };
    vi.mocked(createCustomer).mockResolvedValue(created as never);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={onCreated} />);

    await user.type(screen.getByLabelText("Nome"), "João Pereira");
    await user.click(screen.getByRole("button", { name: /criar cliente/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
  });

  it("QC3: defaults kind to individual (Pessoa física) and sends kind accordingly", async () => {
    vi.mocked(createCustomer).mockResolvedValue({ id: "cust-1", name: "João" } as never);
    const user = userEvent.setup();
    render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome"), "João");
    await user.click(screen.getByRole("button", { name: /criar cliente/i }));

    await waitFor(() => expect(createCustomer).toHaveBeenCalled());
    expect(vi.mocked(createCustomer).mock.calls[0]![0].kind).toBe("individual");
  });

  it("QC4: switching to Pessoa jurídica shows the CNPJ lookup button", async () => {
    const user = userEvent.setup();
    render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));

    expect(screen.getByRole("button", { name: /buscar cnpj/i })).toBeInTheDocument();
  });

  it("QC5: CNPJ lookup fills empty fields only — a manually-typed name is never overwritten", async () => {
    vi.mocked(lookupCnpj).mockResolvedValue({
      document: "12345678000199",
      legal_name: "Empresa Registrada LTDA",
      trade_name: "Empresa Fantasia",
      phone: "+551123851939",
      email: "contato@empresa.com",
      address: { postal_code: "30140110", street: "Rua X", number: "10", complement: null, neighborhood: "Centro", city: "Belo Horizonte", state: "MG" },
    });
    const user = userEvent.setup();
    render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
    await user.type(screen.getByLabelText("Nome"), "Nome Digitado Pelo Usuário");
    await user.type(screen.getByLabelText(/cnpj/i), "12345678000199");
    await user.click(screen.getByRole("button", { name: /buscar cnpj/i }));

    await waitFor(() => expect(lookupCnpj).toHaveBeenCalled());
    expect(screen.getByLabelText("Nome")).toHaveValue("Nome Digitado Pelo Usuário");
  });

  it("QC6: CNPJ lookup's phone never shows the old '(55)...' bug — the country code is stripped, not read as a DDD", async () => {
    vi.mocked(lookupCnpj).mockResolvedValue({
      document: "12345678000199",
      legal_name: "Empresa Registrada LTDA",
      trade_name: null,
      phone: "+551123851939",
      email: null,
      address: { postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null },
    });
    const user = userEvent.setup();
    render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
    await user.type(screen.getByLabelText(/cnpj/i), "12345678000199");
    await user.click(screen.getByRole("button", { name: /buscar cnpj/i }));

    await waitFor(() => expect(screen.getByLabelText(/telefone/i)).toHaveValue("(11) 2385-1939"));
  });

  it("QC7: CNPJ lookup fills the primary address's empty fields", async () => {
    vi.mocked(lookupCnpj).mockResolvedValue({
      document: "12345678000199",
      legal_name: "Empresa Registrada LTDA",
      trade_name: null,
      phone: null,
      email: null,
      address: { postal_code: "30140110", street: "Rua X", number: "10", complement: null, neighborhood: "Centro", city: "Belo Horizonte", state: "MG" },
    });
    const user = userEvent.setup();
    render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
    await user.type(screen.getByLabelText(/cnpj/i), "12345678000199");
    await user.click(screen.getByRole("button", { name: /buscar cnpj/i }));

    await waitFor(() => expect(screen.getByLabelText(/cidade/i)).toHaveValue("Belo Horizonte"));
  });

  it("QC8: shows a validation error message when the API rejects the payload", async () => {
    const { ApiValidationError } = await import("@/lib/api-client");
    vi.mocked(createCustomer).mockRejectedValue(new ApiValidationError({ document: ["Documento inválido."] }));
    const user = userEvent.setup();
    render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome"), "João");
    await user.click(screen.getByRole("button", { name: /criar cliente/i }));

    await waitFor(() => expect(screen.getByText("Documento inválido.")).toBeInTheDocument());
  });

  it("QC9: shows a generic error message on an unexpected failure", async () => {
    vi.mocked(createCustomer).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome"), "João");
    await user.click(screen.getByRole("button", { name: /criar cliente/i }));

    await waitFor(() => expect(screen.getByText(/não foi possível criar o cliente/i)).toBeInTheDocument());
  });

  it("QC10: the submit button is disabled until a name is entered", () => {
    render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);
    expect(screen.getByRole("button", { name: /criar cliente/i })).toBeDisabled();
  });

  it("QC11: no contact fields are rendered — contact selection belongs to wizard step 2", () => {
    render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);
    expect(screen.queryByLabelText(/cargo/i)).not.toBeInTheDocument();
  });

  it("QC12: cancelling closes the dialog without calling createCustomer", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<QuickCustomerDialog open onOpenChange={onOpenChange} onCreated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^cancelar$/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("OT3: closes itself and clears the typed name if the active company changes while open", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<QuickCustomerDialog open onOpenChange={onOpenChange} onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome"), "Cliente da Empresa A");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<QuickCustomerDialog open onOpenChange={onOpenChange} onCreated={vi.fn()} />);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    // The internal draft is reset even though the test harness keeps
    // `open` truthy — no Company-A-typed value survives.
    expect(screen.getByLabelText("Nome")).toHaveValue("");
  });

  it("OT4: a create response that resolves after a company switch never calls onCreated", async () => {
    let resolveCreate!: (value: unknown) => void;
    const createPromise = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(createCustomer).mockReturnValue(createPromise as never);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={onCreated} />);

    await user.type(screen.getByLabelText("Nome"), "Cliente da Empresa A");
    await user.click(screen.getByRole("button", { name: /criar cliente/i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={onCreated} />);

    resolveCreate({ id: "cust-old", name: "Cliente da Empresa A" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onCreated).not.toHaveBeenCalled();
  });

  describe("Async isolation (bug #2 hardening)", () => {
    it("AQ1: a CNPJ lookup success resolving after a company switch does not populate a freshly mounted dialog", async () => {
      let resolveLookup!: (value: unknown) => void;
      vi.mocked(lookupCnpj).mockReturnValue(
        new Promise((resolve) => {
          resolveLookup = resolve;
        }) as never
      );
      const user = userEvent.setup();
      const { unmount } = render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
      await user.type(screen.getByLabelText(/cnpj/i), "12345678000199");
      await user.click(screen.getByRole("button", { name: /buscar cnpj/i }));
      await waitFor(() => expect(lookupCnpj).toHaveBeenCalled());

      // Simulates the parent (StepCustomer) unmounting this instance on a
      // tenant switch (`quickCreateOpen` forced to false, per the fix).
      unmount();
      authState.activeCompany = { id: "company-b", name: "Empresa B" };

      // A brand-new dialog instance opens under the new tenant.
      render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      resolveLookup({
        document: "12345678000199",
        legal_name: "Empresa Antiga LTDA",
        trade_name: "Empresa Antiga",
        phone: null,
        email: null,
        address: { postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.getByLabelText("Nome")).toHaveValue("");
    });

    it("AQ2: a CNPJ lookup error resolving late does not leak an error message into a fresh dialog session", async () => {
      let rejectLookup!: (error: unknown) => void;
      vi.mocked(lookupCnpj).mockReturnValue(
        new Promise((_resolve, reject) => {
          rejectLookup = reject;
        }) as never
      );
      const user = userEvent.setup();
      const { unmount } = render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
      await user.type(screen.getByLabelText(/cnpj/i), "12345678000199");
      await user.click(screen.getByRole("button", { name: /buscar cnpj/i }));
      await waitFor(() => expect(lookupCnpj).toHaveBeenCalled());

      unmount();
      render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      rejectLookup(new Error("boom"));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.queryByText(/não foi possível consultar o cnpj/i)).not.toBeInTheDocument();
      expect(screen.queryByText("CNPJ não encontrado.")).not.toBeInTheDocument();
    });

    it("AQ3: closing the dialog before a CNPJ response arrives, then reopening it, never lets the late response populate the reopened (fresh) instance", async () => {
      let resolveLookup!: (value: unknown) => void;
      vi.mocked(lookupCnpj).mockReturnValue(
        new Promise((resolve) => {
          resolveLookup = resolve;
        }) as never
      );
      const user = userEvent.setup();
      const { unmount } = render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
      await user.type(screen.getByLabelText(/cnpj/i), "12345678000199");
      await user.click(screen.getByRole("button", { name: /buscar cnpj/i }));
      await waitFor(() => expect(lookupCnpj).toHaveBeenCalled());

      // Dialog closed (per the fix, `StepCustomer` unmounts it entirely).
      unmount();
      // Reopened: a brand-new instance, same tenant.
      render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      resolveLookup({
        document: "12345678000199",
        legal_name: "Empresa Antiga LTDA",
        trade_name: "Empresa Antiga",
        phone: null,
        email: null,
        address: { postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.getByLabelText("Nome")).toHaveValue("");
    });

    it("AQ4: closing the dialog before a CEP response arrives, then reopening it, never lets the late response populate the reopened (fresh) instance", async () => {
      let resolveLookup!: (value: unknown) => void;
      vi.mocked(lookupCep).mockReturnValue(
        new Promise((resolve) => {
          resolveLookup = resolve;
        }) as never
      );
      const user = userEvent.setup();
      const { unmount } = render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      await user.type(screen.getByLabelText(/^cep/i), "30140110");
      await user.click(screen.getByRole("button", { name: /buscar cep/i }));
      await waitFor(() => expect(lookupCep).toHaveBeenCalled());

      unmount();
      render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      resolveLookup({
        postal_code: "30140110",
        street: "Rua Antiga",
        neighborhood: "Bairro Antigo",
        city: "Belo Horizonte",
        state: "MG",
        provider_complement: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.getByLabelText(/cidade/i)).toHaveValue("");
    });

    it("AQ5: a late CEP response after a company switch does not populate the new tenant's fresh dialog", async () => {
      let resolveLookup!: (value: unknown) => void;
      vi.mocked(lookupCep).mockReturnValue(
        new Promise((resolve) => {
          resolveLookup = resolve;
        }) as never
      );
      const user = userEvent.setup();
      const { unmount } = render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      await user.type(screen.getByLabelText(/^cep/i), "30140110");
      await user.click(screen.getByRole("button", { name: /buscar cep/i }));
      await waitFor(() => expect(lookupCep).toHaveBeenCalled());

      unmount();
      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      resolveLookup({
        postal_code: "30140110",
        street: "Rua Antiga",
        neighborhood: "Bairro Antigo",
        city: "Belo Horizonte",
        state: "MG",
        provider_complement: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.getByLabelText(/cidade/i)).toHaveValue("");
    });

    it("AQ6: a late createCustomer validation-error response for a request superseded by a tenant switch never surfaces field errors", async () => {
      let rejectCreate!: (error: unknown) => void;
      const { ApiValidationError } = await import("@/lib/api-client");
      vi.mocked(createCustomer).mockReturnValue(
        new Promise((_resolve, reject) => {
          rejectCreate = reject;
        }) as never
      );
      const user = userEvent.setup();
      const { rerender } = render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      await user.type(screen.getByLabelText("Nome"), "Cliente da Empresa A");
      await user.click(screen.getByRole("button", { name: /criar cliente/i }));

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      rejectCreate(new ApiValidationError({ document: ["Documento inválido."] }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.queryByText("Documento inválido.")).not.toBeInTheDocument();
    });

    it("AQ7: a normal, non-stale submit that fails still re-enables the submit button once its own request settles", async () => {
      vi.mocked(createCustomer).mockRejectedValue(new Error("boom"));
      const user = userEvent.setup();
      render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      await user.type(screen.getByLabelText("Nome"), "Cliente Válido");
      await user.click(screen.getByRole("button", { name: /criar cliente/i }));

      await waitFor(() => expect(screen.getByRole("button", { name: /criar cliente/i })).not.toBeDisabled());
    });

    it("AQ8: every fresh dialog mount starts with all fields at their documented defaults", async () => {
      const user = userEvent.setup();
      const { unmount } = render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
      await user.type(screen.getByLabelText("Nome"), "Rascunho Antigo");
      await user.type(screen.getByLabelText(/cnpj/i), "12345678000199");

      unmount();
      render(<QuickCustomerDialog open onOpenChange={() => {}} onCreated={vi.fn()} />);

      expect(screen.getByRole("button", { name: "Pessoa física" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByLabelText("Nome")).toHaveValue("");
      expect(screen.queryByLabelText(/cnpj/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /criar cliente/i })).toBeDisabled();
    });
  });
});
