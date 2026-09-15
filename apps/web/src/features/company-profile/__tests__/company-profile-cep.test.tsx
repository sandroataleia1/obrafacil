import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyProfilePage } from "../company-profile-page";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import type { CompanyProfile } from "../types";
import type { PostalCodeLookupResult } from "@/features/customers/types";

const authState: {
  activeCompany: { id: string; name: string } | null;
  memberships: { company: { id: string; name: string }; role: "owner" | "admin" | "member" }[];
  refresh: ReturnType<typeof vi.fn>;
} = {
  activeCompany: { id: "company-a", name: "Empresa A" },
  memberships: [{ company: { id: "company-a", name: "Empresa A" }, role: "owner" }],
  refresh: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../company-profile-client", () => ({
  getCompanyProfile: vi.fn(),
  updateCompanyProfile: vi.fn(),
  uploadCompanyLogo: vi.fn(),
  deleteCompanyLogo: vi.fn(),
}));

vi.mock("@/features/customers/customers-client", () => ({
  lookupCnpj: vi.fn(),
  lookupCep: vi.fn(),
}));

import { getCompanyProfile } from "../company-profile-client";
import { lookupCep } from "@/features/customers/customers-client";

function makeProfile(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    id: "company-a",
    name: "Empresa A",
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
    timezone: "America/Sao_Paulo",
    logo_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeCepResult(overrides: Partial<PostalCodeLookupResult> = {}): PostalCodeLookupResult {
  return {
    postal_code: "01001000",
    street: "Praça da Sé",
    neighborhood: "Sé",
    city: "São Paulo",
    state: "SP",
    provider_complement: "lado ímpar",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.activeCompany = { id: "company-a", name: "Empresa A" };
  authState.memberships = [{ company: { id: "company-a", name: "Empresa A" }, role: "owner" }];
});

async function renderLoaded() {
  vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile());
  render(<CompanyProfilePage />);
  await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toBeInTheDocument());
}

async function typeCep(user: ReturnType<typeof userEvent.setup>, digits: string) {
  await user.type(screen.getByLabelText(/^CEP/), digits);
}

describe("CompanyProfilePage CEP lookup (FRONTEND-COMPANY-PROFILE-01 §55 CE1-CE8)", () => {
  /** CE1: a valid lookup succeeds. */
  it("CE1: a valid CEP lookup succeeds", async () => {
    vi.mocked(lookupCep).mockResolvedValue(makeCepResult());
    const user = userEvent.setup();
    await renderLoaded();

    await typeCep(user, "01001000");
    await user.click(screen.getByRole("button", { name: "Buscar CEP" }));

    await waitFor(() => expect(screen.getByLabelText("Logradouro")).toHaveValue("Praça da Sé"));
  });

  /** CE2: fills street/neighborhood/city/state. */
  it("CE2: fills the expected address fields", async () => {
    vi.mocked(lookupCep).mockResolvedValue(makeCepResult());
    const user = userEvent.setup();
    await renderLoaded();

    await typeCep(user, "01001000");
    await user.click(screen.getByRole("button", { name: "Buscar CEP" }));

    await waitFor(() => expect(screen.getByLabelText("Logradouro")).toHaveValue("Praça da Sé"));
    expect(screen.getByLabelText("Bairro")).toHaveValue("Sé");
    expect(screen.getByLabelText("Cidade")).toHaveValue("São Paulo");
  });

  /** CE3: a manually-typed complement is kept, never overwritten by provider_complement. */
  it("CE3: keeps a manually-typed complement", async () => {
    vi.mocked(lookupCep).mockResolvedValue(makeCepResult({ provider_complement: "lado par" }));
    const user = userEvent.setup();
    await renderLoaded();

    await user.type(screen.getByLabelText(/^Complemento/), "Sala 5");
    await typeCep(user, "01001000");
    await user.click(screen.getByRole("button", { name: "Buscar CEP" }));

    await waitFor(() => expect(screen.getByLabelText("Logradouro")).toHaveValue("Praça da Sé"));
    expect(screen.getByLabelText(/^Complemento/)).toHaveValue("Sala 5");
  });

  /** CE4: editing the CEP invalidates a pending lookup. */
  it("CE4: editing the CEP invalidates a pending lookup", async () => {
    let resolveLookup: (value: PostalCodeLookupResult) => void = () => {};
    vi.mocked(lookupCep).mockImplementation(() => new Promise((resolve) => { resolveLookup = resolve; }));
    const user = userEvent.setup();
    await renderLoaded();

    await typeCep(user, "01001000");
    await user.click(screen.getByRole("button", { name: "Buscar CEP" }));

    await user.clear(screen.getByLabelText(/^CEP/));
    await typeCep(user, "20000000");

    resolveLookup(makeCepResult({ street: "RUA DESCARTADA" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByLabelText("Logradouro")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Buscar CEP" })).not.toBeDisabled();
  });

  /** CE5: a second lookup (after re-editing the CEP) wins over a late-resolving first one. */
  it("CE5: the second lookup wins over a late-resolving first one", async () => {
    let resolveFirst: (value: PostalCodeLookupResult) => void = () => {};
    vi.mocked(lookupCep).mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    const user = userEvent.setup();
    await renderLoaded();

    await typeCep(user, "01001000");
    await user.click(screen.getByRole("button", { name: "Buscar CEP" }));
    expect(screen.getByRole("button", { name: "Buscar CEP" })).toBeDisabled();

    await user.clear(screen.getByLabelText(/^CEP/));
    await typeCep(user, "01001000");

    vi.mocked(lookupCep).mockResolvedValueOnce(makeCepResult({ street: "SEGUNDA BUSCA VENCE" }));
    await user.click(screen.getByRole("button", { name: "Buscar CEP" }));

    await waitFor(() => expect(screen.getByLabelText("Logradouro")).toHaveValue("SEGUNDA BUSCA VENCE"));

    resolveFirst(makeCepResult({ street: "PRIMEIRA BUSCA DESCARTADA" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByLabelText("Logradouro")).toHaveValue("SEGUNDA BUSCA VENCE");
  });

  /** CE6: a Company switch discards a pending lookup for the old tenant. */
  it("CE6: a Company switch discards a pending lookup for the old tenant", async () => {
    let resolveLookup: (value: PostalCodeLookupResult) => void = () => {};
    vi.mocked(lookupCep).mockImplementation(() => new Promise((resolve) => { resolveLookup = resolve; }));
    const user = userEvent.setup();
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile());
    const { rerender } = render(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toBeInTheDocument());

    await typeCep(user, "01001000");
    await user.click(screen.getByRole("button", { name: "Buscar CEP" }));

    vi.mocked(getCompanyProfile).mockResolvedValueOnce(makeProfile({ id: "company-b", name: "Empresa B" }));
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    authState.memberships = [{ company: { id: "company-b", name: "Empresa B" }, role: "owner" }];
    rerender(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Empresa B"));

    resolveLookup(makeCepResult({ street: "NUNCA DEVE APARECER EM B" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByDisplayValue("NUNCA DEVE APARECER EM B")).not.toBeInTheDocument();
  });

  /** CE7: a 404 allows continuing manually. */
  it("CE7: a 404 shows a message but the form stays fully editable", async () => {
    vi.mocked(lookupCep).mockRejectedValue(new ApiError(404, "not found"));
    const user = userEvent.setup();
    await renderLoaded();

    await typeCep(user, "99999999");
    await user.click(screen.getByRole("button", { name: "Buscar CEP" }));

    await waitFor(() => expect(screen.getByText(/CEP não encontrado/)).toBeInTheDocument());
    await user.type(screen.getByLabelText("Logradouro"), "Rua Preenchida Manualmente");
    expect(screen.getByLabelText("Logradouro")).toHaveValue("Rua Preenchida Manualmente");
  });

  /** CE8: state is filled in canonical uppercase form. */
  it("CE8: state is filled uppercase", async () => {
    vi.mocked(lookupCep).mockResolvedValue(makeCepResult({ state: "SP" }));
    const user = userEvent.setup();
    await renderLoaded();

    await typeCep(user, "01001000");
    await user.click(screen.getByRole("button", { name: "Buscar CEP" }));

    await waitFor(() => expect(document.getElementById("company-address-state")).toHaveTextContent("SP"));
  });

  it("validation: an invalid CEP from the API surfaces the right message", async () => {
    vi.mocked(lookupCep).mockRejectedValue(new ApiValidationError({ cep: ["invalid"] }));
    const user = userEvent.setup();
    await renderLoaded();

    await typeCep(user, "01001000");
    await user.click(screen.getByRole("button", { name: "Buscar CEP" }));

    await waitFor(() => expect(screen.getByText("CEP inválido.")).toBeInTheDocument());
  });
});
