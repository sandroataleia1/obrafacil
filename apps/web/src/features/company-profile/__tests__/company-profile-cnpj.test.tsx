import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyProfilePage } from "../company-profile-page";
import { ApiError } from "@/lib/api-client";
import type { CompanyProfile } from "../types";
import type { CompanyRegistryLookupResult } from "@/features/customers/types";

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
import { lookupCnpj } from "@/features/customers/customers-client";

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

function makeCnpjResult(overrides: Partial<CompanyRegistryLookupResult> = {}): CompanyRegistryLookupResult {
  return {
    document: "19131243000197",
    legal_name: "OPEN KNOWLEDGE BRASIL",
    trade_name: "REDE PELO CONHECIMENTO LIVRE",
    phone: "+551123851939",
    email: "contato@okfn.org",
    address: {
      postal_code: "01311902",
      street: "PAULISTA",
      number: "37",
      complement: "ANDAR 4",
      neighborhood: "BELA VISTA",
      city: "SAO PAULO",
      state: "SP",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.activeCompany = { id: "company-a", name: "Empresa A" };
  authState.memberships = [{ company: { id: "company-a", name: "Empresa A" }, role: "owner" }];
});

async function renderLoaded(profileOverrides: Partial<CompanyProfile> = {}) {
  vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile(profileOverrides));
  render(<CompanyProfilePage />);
  await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toBeInTheDocument());
}

async function typeCnpj(user: ReturnType<typeof userEvent.setup>, digits: string) {
  await user.type(screen.getByLabelText("CNPJ (opcional)"), digits);
}

describe("CompanyProfilePage CNPJ lookup (FRONTEND-COMPANY-PROFILE-01 §54 CJ1-CJ8)", () => {
  /** CJ1: a valid lookup succeeds and fills fields. */
  it("CJ1: a valid CNPJ lookup succeeds", async () => {
    vi.mocked(lookupCnpj).mockResolvedValue(makeCnpjResult());
    const user = userEvent.setup();
    await renderLoaded();

    await typeCnpj(user, "19131243000197");
    await user.click(screen.getByRole("button", { name: "Buscar CNPJ" }));

    await waitFor(() => expect(screen.getByLabelText("Razão social (opcional)")).toHaveValue("OPEN KNOWLEDGE BRASIL"));
  });

  /** CJ2: only empty fields are filled. */
  it("CJ2: fills only empty fields, never overwrites what's already typed", async () => {
    vi.mocked(lookupCnpj).mockResolvedValue(makeCnpjResult({ trade_name: "Nome Fantasia Da API" }));
    const user = userEvent.setup();
    await renderLoaded();

    await user.type(screen.getByLabelText("Nome fantasia (opcional)"), "Já Digitado Pelo Usuário");
    await typeCnpj(user, "19131243000197");
    await user.click(screen.getByRole("button", { name: "Buscar CNPJ" }));

    await waitFor(() => expect(screen.getByLabelText("Razão social (opcional)")).toHaveValue("OPEN KNOWLEDGE BRASIL"));
    expect(screen.getByLabelText("Nome fantasia (opcional)")).toHaveValue("Já Digitado Pelo Usuário");
  });

  /** CJ3: `name` (workspace display name) is NEVER touched by a CNPJ lookup. */
  it("CJ3: never overwrites the workspace name", async () => {
    vi.mocked(lookupCnpj).mockResolvedValue(makeCnpjResult());
    const user = userEvent.setup();
    await renderLoaded({ name: "Nome Do Workspace" });

    await typeCnpj(user, "19131243000197");
    await user.click(screen.getByRole("button", { name: "Buscar CNPJ" }));

    await waitFor(() => expect(screen.getByLabelText("Razão social (opcional)")).toHaveValue("OPEN KNOWLEDGE BRASIL"));
    expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Nome Do Workspace");
  });

  /** CJ4: the phone from the lookup is displayed correctly as a BR mask (never mistaking +55 for a DDD). */
  it("CJ4: displays the looked-up phone with the correct BR mask", async () => {
    vi.mocked(lookupCnpj).mockResolvedValue(makeCnpjResult({ phone: "+551123851939" }));
    const user = userEvent.setup();
    await renderLoaded();

    await typeCnpj(user, "19131243000197");
    await user.click(screen.getByRole("button", { name: "Buscar CNPJ" }));

    await waitFor(() => expect(screen.getByLabelText("Telefone (opcional)")).toHaveValue("(11) 2385-1939"));
  });

  /** CJ5: editing the document field invalidates a pending lookup. */
  it("CJ5: editing the document invalidates a pending lookup", async () => {
    let resolveLookup: (value: CompanyRegistryLookupResult) => void = () => {};
    vi.mocked(lookupCnpj).mockImplementation(() => new Promise((resolve) => { resolveLookup = resolve; }));
    const user = userEvent.setup();
    await renderLoaded();

    await typeCnpj(user, "19131243000197");
    await user.click(screen.getByRole("button", { name: "Buscar CNPJ" }));

    // Edit the document while the lookup is still pending.
    await user.clear(screen.getByLabelText("CNPJ (opcional)"));
    await typeCnpj(user, "00000000000000");

    resolveLookup(makeCnpjResult({ legal_name: "RESULTADO DESCARTADO" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByLabelText("Razão social (opcional)")).toHaveValue("");
    // "Buscar CNPJ" is not stuck disabled for the new document.
    expect(screen.getByRole("button", { name: "Buscar CNPJ" })).not.toBeDisabled();
  });

  /**
   * CJ6: a second lookup (started after editing the document away and
   * back — the button is disabled mid-flight, mirroring the Customer
   * wizard's own "Buscar CNPJ" UX, so two literal overlapping clicks
   * aren't UI-reachable) supersedes the first: the first's late
   * response is discarded by the generation ref even though it resolves
   * after the second one already applied.
   */
  it("CJ6: the second lookup wins over a late-resolving first one", async () => {
    let resolveFirst: (value: CompanyRegistryLookupResult) => void = () => {};
    vi.mocked(lookupCnpj).mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    const user = userEvent.setup();
    await renderLoaded();

    await typeCnpj(user, "19131243000197");
    await user.click(screen.getByRole("button", { name: "Buscar CNPJ" }));
    expect(screen.getByRole("button", { name: "Buscar CNPJ" })).toBeDisabled();

    // Re-editing the document bumps the generation and re-enables the button.
    await user.clear(screen.getByLabelText("CNPJ (opcional)"));
    await typeCnpj(user, "19131243000197");
    expect(screen.getByRole("button", { name: "Buscar CNPJ" })).not.toBeDisabled();

    vi.mocked(lookupCnpj).mockResolvedValueOnce(makeCnpjResult({ legal_name: "SEGUNDA BUSCA VENCE" }));
    await user.click(screen.getByRole("button", { name: "Buscar CNPJ" }));

    await waitFor(() => expect(screen.getByLabelText("Razão social (opcional)")).toHaveValue("SEGUNDA BUSCA VENCE"));

    resolveFirst(makeCnpjResult({ legal_name: "PRIMEIRA BUSCA DESCARTADA" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByLabelText("Razão social (opcional)")).toHaveValue("SEGUNDA BUSCA VENCE");
  });

  /** CJ7: a Company switch discards an old CNPJ lookup — the new tenant's instance never sees it. */
  it("CJ7: a Company switch discards a pending lookup for the old tenant", async () => {
    let resolveLookup: (value: CompanyRegistryLookupResult) => void = () => {};
    vi.mocked(lookupCnpj).mockImplementation(() => new Promise((resolve) => { resolveLookup = resolve; }));
    const user = userEvent.setup();
    const { rerender } = render(<CompanyProfilePage />);
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile());
    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toBeInTheDocument());

    await typeCnpj(user, "19131243000197");
    await user.click(screen.getByRole("button", { name: "Buscar CNPJ" }));

    vi.mocked(getCompanyProfile).mockResolvedValueOnce(makeProfile({ id: "company-b", name: "Empresa B" }));
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    authState.memberships = [{ company: { id: "company-b", name: "Empresa B" }, role: "owner" }];
    rerender(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Empresa B"));

    resolveLookup(makeCnpjResult({ legal_name: "NUNCA DEVE APARECER EM B" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByDisplayValue("NUNCA DEVE APARECER EM B")).not.toBeInTheDocument();
  });

  /** CJ8: a lookup error is shown in a controlled way. */
  it("CJ8: a lookup error is shown in a controlled way", async () => {
    vi.mocked(lookupCnpj).mockRejectedValue(new ApiError(404, "not found"));
    const user = userEvent.setup();
    await renderLoaded();

    await typeCnpj(user, "19131243000197");
    await user.click(screen.getByRole("button", { name: "Buscar CNPJ" }));

    await waitFor(() => expect(screen.getByText("CNPJ não encontrado.")).toBeInTheDocument());
  });
});
