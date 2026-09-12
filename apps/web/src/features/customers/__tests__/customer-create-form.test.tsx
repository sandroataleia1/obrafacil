import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CustomerCreateForm } from "../customer-create-form";
import type { Customer } from "../types";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../customers-client", () => ({
  createCustomer: vi.fn(),
  lookupCnpj: vi.fn(),
  lookupCep: vi.fn(),
}));

import { createCustomer, lookupCep, lookupCnpj } from "../customers-client";
import { ApiValidationError } from "@/lib/api-client";

const CREATED_CUSTOMER: Customer = {
  id: "new-id",
  kind: "individual",
  name: "João",
  legal_name: null,
  trade_name: null,
  document: null,
  phone: null,
  email: null,
  notes: null,
  active: true,
  addresses: [],
  contacts: [],
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

async function fillNameAndAdvanceToStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nome"), "Maria Cliente");
  await user.click(screen.getByRole("button", { name: "Avançar" }));
}

async function advanceToStep3(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Avançar" }));
}

async function advanceToStep4(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Avançar" }));
}

describe("CustomerCreateForm (4-step wizard)", () => {
  beforeEach(() => {
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    vi.mocked(createCustomer).mockReset().mockResolvedValue(CREATED_CUSTOMER);
    vi.mocked(lookupCnpj).mockReset();
    vi.mocked(lookupCep).mockReset();
    push.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("step flow", () => {
    it("starts on step 1 with the type selector and name field", () => {
      render(<CustomerCreateForm />);
      expect(screen.getAllByText(/etapa 1 de 4/i)[0]!).toBeInTheDocument();
      expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    });

    it("blocks advancing with an empty name and shows an inline error", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await user.click(screen.getByRole("button", { name: "Avançar" }));
      expect(screen.getByText("Informe o nome para continuar.")).toBeInTheDocument();
      expect(screen.getAllByText(/etapa 1 de 4/i)[0]!).toBeInTheDocument();
    });

    it("advances to step 2 once name is filled", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      expect(screen.getAllByText(/etapa 2 de 4/i)[0]!).toBeInTheDocument();
      expect(screen.getByText("Endereço principal")).toBeInTheDocument();
    });

    it("going back preserves name, address and contact data already entered", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await user.clear(screen.getByLabelText("Identificação do endereço"));
      await user.type(screen.getByLabelText("Identificação do endereço"), "Casa");
      await advanceToStep3(user);
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
      await user.type(screen.getAllByLabelText("Nome")[0]!, "Contato 1");

      await user.click(screen.getByRole("button", { name: "Voltar" }));
      await user.click(screen.getByRole("button", { name: "Voltar" }));
      expect(screen.getByLabelText("Nome")).toHaveValue("Maria Cliente");

      await advanceToStep3(user);
      expect(screen.getByLabelText("Identificação do endereço")).toHaveValue("Casa");
      await advanceToStep4(user);
      expect(screen.getAllByLabelText("Nome")[0]).toHaveValue("Contato 1");
    });

    it("a forward stepper-jump re-validates intermediate steps and blocks if invalid", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await advanceToStep4(user);
      // Step 4 is now "reached" (maxReachedStep === 4), so the stepper
      // button for it is enabled. Go back to step 3 and invalidate it by
      // adding a blank contact draft.
      await user.click(screen.getByRole("button", { name: "Voltar" }));
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));

      // Jump the stepper backward to step 1, then forward straight to the
      // already-visited step 4 — this must re-check step 3 on the way and
      // block there instead of silently landing on Revisão.
      await user.click(screen.getByRole("button", { name: /1.*dados básicos/i }));
      await user.click(screen.getByRole("button", { name: /4.*revisão/i }));

      expect(screen.getAllByText(/etapa 3 de 4/i)[0]!).toBeInTheDocument();
      expect(screen.getByText("Preencha o nome do contato ou remova o rascunho antes de continuar.")).toBeInTheDocument();
    });

    it("a forward stepper-jump blocks on step 1 if name was cleared after visiting later steps", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await advanceToStep4(user);

      await user.click(screen.getByRole("button", { name: /1.*dados básicos/i }));
      await user.clear(screen.getByLabelText("Nome"));

      await user.click(screen.getByRole("button", { name: /4.*revisão/i }));
      expect(screen.getAllByText(/etapa 1 de 4/i)[0]!).toBeInTheDocument();
      expect(screen.getByText("Informe o nome para continuar.")).toBeInTheDocument();
    });

    it("step 2 can be skipped with zero meaningful address data", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await advanceToStep4(user);
      expect(screen.getByText("Nenhum endereço informado.")).toBeInTheDocument();
    });

    it("step 3 allows zero contacts", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      expect(screen.getByText("Nenhum contato adicionado.")).toBeInTheDocument();
      await advanceToStep4(user);
      expect(screen.getAllByText(/etapa 4 de 4/i)[0]!).toBeInTheDocument();
    });

    it("a blank contact draft blocks advancing past step 3", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
      await user.click(screen.getByRole("button", { name: "Avançar" }));
      expect(screen.getAllByText(/etapa 3 de 4/i)[0]!).toBeInTheDocument();
    });

    it("step 4 shows an accurate summary and 'Editar' returns to the correct step", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await user.clear(screen.getByLabelText("Identificação do endereço"));
      await user.type(screen.getByLabelText("Identificação do endereço"), "Casa");
      await advanceToStep3(user);
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
      await user.type(screen.getAllByLabelText("Nome")[0]!, "Contato Um");
      await advanceToStep4(user);

      expect(screen.getByText("Maria Cliente")).toBeInTheDocument();
      expect(screen.getByText("Casa")).toBeInTheDocument();
      expect(screen.getByText("Contato Um")).toBeInTheDocument();

      const clienteCard = screen.getByText("Cliente").closest("div")!.parentElement!;
      await user.click(within(clienteCard).getByRole("button", { name: "Editar" }));
      expect(screen.getAllByText(/etapa 1 de 4/i)[0]!).toBeInTheDocument();
    });

    it("final submit fires exactly one createCustomer call", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));
      await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    });
  });

  describe("CNPJ", () => {
    it("PF never shows 'Buscar CNPJ'; PJ does", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      expect(screen.queryByRole("button", { name: /Buscar CNPJ/ })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
      expect(screen.getByRole("button", { name: /Buscar CNPJ/ })).toBeInTheDocument();
    });

    it("a locally-invalid CNPJ shows an inline error without calling the API", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
      await user.type(screen.getByLabelText(/^CNPJ/), "123");
      await user.click(screen.getByRole("button", { name: /Buscar CNPJ/ }));
      expect(screen.getByText("Informe um CNPJ com 14 dígitos.")).toBeInTheDocument();
      expect(lookupCnpj).not.toHaveBeenCalled();
    });

    it("a successful lookup fills only empty fields and never overwrites typed values", async () => {
      vi.mocked(lookupCnpj).mockResolvedValue({
        document: "19131243000197",
        legal_name: "Open Knowledge Brasil",
        trade_name: "OKBR",
        phone: "+551123851939",
        email: "contato@okbr.org.br",
        address: {
          postal_code: "01310000",
          street: "Avenida Paulista",
          number: "1000",
          complement: null,
          neighborhood: "Bela Vista",
          city: "São Paulo",
          state: "SP",
        },
      });

      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
      await user.type(screen.getByLabelText("Nome para identificação"), "Meu Nome Manual");
      await user.type(screen.getByLabelText(/^CNPJ/), "19131243000197");
      await user.click(screen.getByRole("button", { name: /Buscar CNPJ/ }));

      await waitFor(() => expect(screen.getByLabelText(/Razão social/)).toHaveValue("Open Knowledge Brasil"));
      expect(screen.getByLabelText("Nome para identificação")).toHaveValue("Meu Nome Manual");

      const phoneInput = screen.getByLabelText(/Telefone geral/) as HTMLInputElement;
      expect(phoneInput.value).toBe("(11) 2385-1939");
      expect(phoneInput.value.startsWith("(55)")).toBe(false);
    });

    it("a successful CNPJ lookup populates the primary address draft, visible in step 2 and in the final payload", async () => {
      vi.mocked(lookupCnpj).mockResolvedValue({
        document: "19131243000197",
        legal_name: "Empresa Exemplo",
        trade_name: null,
        phone: null,
        email: null,
        address: {
          postal_code: "01310000",
          street: "Avenida Paulista",
          number: "1000",
          complement: null,
          neighborhood: "Bela Vista",
          city: "São Paulo",
          state: "SP",
        },
      });

      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
      await user.type(screen.getByLabelText(/^CNPJ/), "19131243000197");
      await user.click(screen.getByRole("button", { name: /Buscar CNPJ/ }));
      await waitFor(() => expect(screen.getByLabelText(/Razão social/)).toHaveValue("Empresa Exemplo"));

      await user.click(screen.getByRole("button", { name: "Avançar" }));
      expect(screen.getByLabelText("Cidade")).toHaveValue("São Paulo");

      await user.click(screen.getByRole("button", { name: "Avançar" }));
      await user.click(screen.getByRole("button", { name: "Avançar" }));
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));

      await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createCustomer).mock.calls[0]![0];
      expect(payload.addresses).toHaveLength(1);
      expect(payload.addresses![0]!.city).toBe("São Paulo");
      expect(payload.addresses![0]!.is_primary).toBe(true);
    });

    it("two successive lookups: the second's result wins even if the first resolves later", async () => {
      let resolveFirst!: (value: unknown) => void;
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });
      const secondResult = {
        document: "19131243000197",
        legal_name: "Segunda Empresa",
        trade_name: null,
        phone: null,
        email: null,
        address: { postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null },
      };

      let secondPromiseResolve!: (value: unknown) => void;
      const secondPromise = new Promise((resolve) => {
        secondPromiseResolve = resolve;
      });
      vi.mocked(lookupCnpj).mockReturnValueOnce(firstPromise as never).mockReturnValueOnce(secondPromise as never);

      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
      await user.type(screen.getByLabelText(/^CNPJ/), "19131243000197");

      // Two lookups started in the same tick (before the button's
      // `disabled` attribute from the first click's loading state has a
      // chance to apply) — the generation guard, not the disabled prop,
      // is what must decide which result wins.
      const button = screen.getByRole("button", { name: /Buscar CNPJ/ });
      act(() => {
        fireEvent.click(button);
        fireEvent.click(button);
      });
      await waitFor(() => expect(lookupCnpj).toHaveBeenCalledTimes(2));

      secondPromiseResolve(secondResult);
      await waitFor(() => expect(screen.getByLabelText(/Razão social/)).toHaveValue("Segunda Empresa"));

      resolveFirst({
        document: "19131243000197",
        legal_name: "Primeira Empresa (atrasada)",
        trade_name: null,
        phone: null,
        email: null,
        address: { postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.getByLabelText(/Razão social/)).toHaveValue("Segunda Empresa");
    });
  });

  describe("address", () => {
    it("the primary draft exists visually from the start of step 2", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      expect(screen.getByLabelText("Identificação do endereço")).toHaveValue("Endereço principal");
      expect(screen.getByLabelText("Cidade")).toBeInTheDocument();
    });

    it("leaving the primary draft untouched results in an empty addresses[] in the final payload", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));

      await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createCustomer).mock.calls[0]![0];
      expect(payload.addresses).toEqual([]);
    });

    it("a manually-filled address is included in the payload", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await user.type(screen.getByLabelText("Cidade"), "Belo Horizonte");
      await advanceToStep3(user);
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));

      await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createCustomer).mock.calls[0]![0];
      expect(payload.addresses).toHaveLength(1);
      expect(payload.addresses![0]!.city).toBe("Belo Horizonte");
      expect(payload.addresses![0]!.is_primary).toBe(true);
    });

    it("adding a second address, promoting it to primary demotes the first; exactly one is_primary in the payload", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await user.type(screen.getByLabelText("Cidade"), "Belo Horizonte");
      await user.click(screen.getByRole("button", { name: "Adicionar endereço" }));
      const cityInputs = screen.getAllByLabelText("Cidade");
      await user.type(cityInputs[cityInputs.length - 1]!, "São Paulo");
      await user.click(screen.getByRole("button", { name: "Tornar principal" }));

      await advanceToStep3(user);
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));

      await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createCustomer).mock.calls[0]![0];
      expect(payload.addresses).toHaveLength(2);
      const primaries = payload.addresses!.filter((address) => address.is_primary);
      expect(primaries).toHaveLength(1);
      expect(primaries[0]!.city).toBe("São Paulo");
    });

    it("removing a secondary address works", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await user.click(screen.getByRole("button", { name: "Adicionar endereço" }));
      expect(screen.getByRole("button", { name: "Tornar principal" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Remover endereço/ }));
      expect(screen.queryByRole("button", { name: "Tornar principal" })).not.toBeInTheDocument();
    });

    it("a CEP lookup fills empty fields only", async () => {
      vi.mocked(lookupCep).mockResolvedValue({
        postal_code: "01001000",
        street: "Praça da Sé",
        neighborhood: "Sé",
        city: "São Paulo",
        state: "SP",
        provider_complement: "lado ímpar",
      });

      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await user.type(screen.getByLabelText("Número"), "42");
      await user.type(screen.getByLabelText("CEP (opcional)"), "01001000");
      await user.click(screen.getByRole("button", { name: "Buscar CEP" }));

      await waitFor(() => expect(screen.getByLabelText("Cidade")).toHaveValue("São Paulo"));
      expect(screen.getByLabelText("Número")).toHaveValue("42");
    });

    it("data entered on step 2 survives navigating back to step 1 and forward again", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await user.type(screen.getByLabelText("Cidade"), "Curitiba");
      await user.click(screen.getByRole("button", { name: "Voltar" }));
      expect(screen.getByLabelText("Nome")).toHaveValue("Maria Cliente");
      await user.click(screen.getByRole("button", { name: "Avançar" }));
      expect(screen.getByLabelText("Cidade")).toHaveValue("Curitiba");
    });

    it("a 422 on addresses routes back to step 2 without losing step-1/step-3 data", async () => {
      vi.mocked(createCustomer).mockRejectedValueOnce(
        new ApiValidationError({
          "addresses.0.postal_code": ["CEP inválido."],
        })
      );

      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await user.type(screen.getByLabelText("Cidade"), "Curitiba");
      await advanceToStep3(user);
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
      await user.type(screen.getAllByLabelText("Nome")[0]!, "Contato Preservado");
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));

      await waitFor(() => expect(screen.getAllByText(/etapa 2 de 4/i)[0]!).toBeInTheDocument());
      expect(screen.getByText("CEP inválido.")).toBeInTheDocument();
      expect(screen.getByLabelText("Cidade")).toHaveValue("Curitiba");

      await advanceToStep3(user);
      expect(screen.getAllByLabelText("Nome")[0]).toHaveValue("Contato Preservado");
    });

    it("a 422 on a specific address card surfaces on that card, not just a generic banner", async () => {
      vi.mocked(createCustomer).mockRejectedValueOnce(
        new ApiValidationError({
          "addresses.1.city": ["Cidade inválida."],
        })
      );

      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await user.click(screen.getByRole("button", { name: "Adicionar endereço" }));
      const cityInputs = screen.getAllByLabelText("Cidade");
      await user.type(cityInputs[cityInputs.length - 1]!, "Cidade X");
      await advanceToStep3(user);
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));

      await waitFor(() => expect(screen.getByText("Cidade inválida.")).toBeInTheDocument());
    });
  });

  describe("contacts", () => {
    it("starts empty with the empty-state message", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      expect(screen.getByText("Nenhum contato adicionado.")).toBeInTheDocument();
    });

    it("adding the first contact makes it primary automatically", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
      expect(screen.getByText("Principal")).toBeInTheDocument();
    });

    it("phone/whatsapp convert to E.164 in the payload while displaying BR-masked", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
      await user.type(screen.getAllByLabelText("Nome")[0]!, "Contato Um");
      await user.type(screen.getByLabelText("Telefone (opcional)"), "31988880001");
      await user.type(screen.getByLabelText("WhatsApp (opcional)"), "31988880002");
      expect(screen.getByLabelText("Telefone (opcional)")).toHaveValue("(31) 98888-0001");

      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));
      await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createCustomer).mock.calls[0]![0];
      expect(payload.contacts![0]!.phone).toBe("+5531988880001");
      expect(payload.contacts![0]!.whatsapp).toBe("+5531988880002");
    });

    it("adding a second contact and promoting it demotes the first; exactly one primary in the payload", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
      await user.type(screen.getAllByLabelText("Nome")[0]!, "Primeiro");
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
      const nameInputs = screen.getAllByLabelText("Nome");
      await user.type(nameInputs[nameInputs.length - 1]!, "Segundo");
      await user.click(screen.getByRole("button", { name: "Tornar principal" }));

      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));
      await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createCustomer).mock.calls[0]![0];
      const primaries = payload.contacts!.filter((contact) => contact.is_primary);
      expect(primaries).toHaveLength(1);
      expect(primaries[0]!.name).toBe("Segundo");
    });

    it("every contact in the payload has active: true", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
      await user.type(screen.getAllByLabelText("Nome")[0]!, "Contato Um");
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));
      await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createCustomer).mock.calls[0]![0];
      expect(payload.contacts![0]!.active).toBe(true);
    });

    it("a 422 on contacts.N.* surfaces on the correct card", async () => {
      vi.mocked(createCustomer).mockRejectedValueOnce(
        new ApiValidationError({
          "contacts.0.email": ["E-mail inválido."],
        })
      );

      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
      await user.type(screen.getAllByLabelText("Nome")[0]!, "Contato Um");
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));

      await waitFor(() => expect(screen.getByText("E-mail inválido.")).toBeInTheDocument());
    });

    it("removing a draft before submit means it's never sent", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
      await user.click(screen.getByRole("button", { name: /Remover contato/ }));
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));
      await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createCustomer).mock.calls[0]![0];
      expect(payload.contacts).toEqual([]);
    });
  });

  describe("atomic create", () => {
    it("sends exactly one createCustomer call with Customer + addresses + contacts in the SAME payload, no hostile fields", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await user.type(screen.getByLabelText("Cidade"), "Recife");
      await advanceToStep3(user);
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
      await user.type(screen.getAllByLabelText("Nome")[0]!, "Contato Um");
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));

      await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createCustomer).mock.calls[0]![0];
      expect(payload.name).toBe("Maria Cliente");
      expect(payload.addresses).toHaveLength(1);
      expect(payload.contacts).toHaveLength(1);
      expect(payload).not.toHaveProperty("id");
      expect(payload).not.toHaveProperty("company_id");
      expect(payload).not.toHaveProperty("created_at");
      expect(payload).not.toHaveProperty("updated_at");
    });

    it("a double-click on 'Criar cliente' results in exactly one network call", async () => {
      let resolveCreate!: (value: Customer) => void;
      vi.mocked(createCustomer).mockReturnValue(
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
      );
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await advanceToStep4(user);
      const submitButton = screen.getByRole("button", { name: "Criar cliente" });
      await user.click(submitButton);
      await user.click(screen.getByRole("button", { name: /criando/i }));

      resolveCreate(CREATED_CUSTOMER);
      await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    });

    it("success navigates to the created customer's detail page", async () => {
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));
      await waitFor(() => expect(push).toHaveBeenCalledWith("/clientes/new-id"));
    });

    it("a 422 preserves every step's data", async () => {
      vi.mocked(createCustomer).mockRejectedValueOnce(
        new ApiValidationError({
          document: ["Documento inválido."],
        })
      );

      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await user.type(screen.getByLabelText("Cidade"), "Fortaleza");
      await advanceToStep3(user);
      await user.click(screen.getByRole("button", { name: "Adicionar contato" }));
      await user.type(screen.getAllByLabelText("Nome")[0]!, "Contato Preservado");
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));

      await waitFor(() => expect(screen.getAllByText(/etapa 1 de 4/i)[0]!).toBeInTheDocument());
      expect(screen.getByText("Documento inválido.")).toBeInTheDocument();
      expect(screen.getByLabelText("Nome")).toHaveValue("Maria Cliente");

      await user.click(screen.getByRole("button", { name: "Avançar" }));
      expect(screen.getByLabelText("Cidade")).toHaveValue("Fortaleza");
      await advanceToStep3(user);
      expect(screen.getAllByLabelText("Nome")[0]).toHaveValue("Contato Preservado");
    });

    it("a network error shows a retry-able state without resetting the form", async () => {
      vi.mocked(createCustomer).mockRejectedValueOnce(new Error("network down"));
      const user = userEvent.setup();
      render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));

      await waitFor(() => expect(screen.getByText("Não foi possível criar o cliente agora.")).toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Criar cliente" })).not.toBeDisabled();

      vi.mocked(createCustomer).mockResolvedValueOnce(CREATED_CUSTOMER);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));
      await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(2));
    });
  });

  describe("tenant", () => {
    it("a company switch mid-wizard fully resets to a fresh step-1 instance", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await user.type(screen.getByLabelText("Cidade"), "Salvador");

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<CustomerCreateForm />);

      await waitFor(() => expect(screen.getAllByText(/etapa 1 de 4/i)[0]!).toBeInTheDocument());
      expect(screen.getByLabelText("Nome")).toHaveValue("");
      expect(screen.queryByText("Salvador")).not.toBeInTheDocument();
    });

    it("a late CNPJ lookup response for the OLD company doesn't populate the new instance", async () => {
      let resolveLookup!: (value: unknown) => void;
      vi.mocked(lookupCnpj).mockReturnValue(
        new Promise((resolve) => {
          resolveLookup = resolve;
        }) as never
      );

      const user = userEvent.setup();
      const { rerender } = render(<CustomerCreateForm />);
      await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
      await user.type(screen.getByLabelText(/^CNPJ/), "19131243000197");
      await user.click(screen.getByRole("button", { name: /Buscar CNPJ/ }));

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<CustomerCreateForm />);
      await waitFor(() => expect(screen.getAllByText(/etapa 1 de 4/i)[0]!).toBeInTheDocument());

      resolveLookup({
        document: "19131243000197",
        legal_name: "Empresa Antiga",
        trade_name: null,
        phone: null,
        email: null,
        address: { postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.queryByText("Empresa Antiga")).not.toBeInTheDocument();
    });

    it("a createCustomer success resolving AFTER a company switch does not navigate in the new instance", async () => {
      let resolveCreate!: (value: Customer) => void;
      vi.mocked(createCustomer).mockReturnValue(
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
      );

      const user = userEvent.setup();
      const { rerender } = render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<CustomerCreateForm />);
      await waitFor(() => expect(screen.getAllByText(/etapa 1 de 4/i)[0]!).toBeInTheDocument());

      resolveCreate(CREATED_CUSTOMER);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(push).not.toHaveBeenCalled();
    });

    it("a createCustomer error resolving after a switch doesn't surface in the new instance", async () => {
      let rejectCreate!: (reason: unknown) => void;
      vi.mocked(createCustomer).mockReturnValue(
        new Promise((_resolve, reject) => {
          rejectCreate = reject;
        })
      );

      const user = userEvent.setup();
      const { rerender } = render(<CustomerCreateForm />);
      await fillNameAndAdvanceToStep2(user);
      await advanceToStep3(user);
      await advanceToStep4(user);
      await user.click(screen.getByRole("button", { name: "Criar cliente" }));

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<CustomerCreateForm />);
      await waitFor(() => expect(screen.getAllByText(/etapa 1 de 4/i)[0]!).toBeInTheDocument());

      rejectCreate(new Error("network down"));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.queryByText("Não foi possível criar o cliente agora.")).not.toBeInTheDocument();
    });

    it("the new instance after a switch starts completely clean on every field", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<CustomerCreateForm />);
      await user.click(screen.getByRole("button", { name: "Pessoa jurídica" }));
      await user.type(screen.getByLabelText("Nome para identificação"), "Empresa Antiga");
      await user.type(screen.getByLabelText(/Telefone geral/), "31988887777");
      await user.type(screen.getByLabelText(/E-mail/), "antigo@example.com");

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<CustomerCreateForm />);

      await waitFor(() => expect(screen.getByLabelText(/^CPF/)).toBeInTheDocument());
      expect(screen.getByLabelText("Nome")).toHaveValue("");
    });
  });
});
