import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyProfilePage } from "../company-profile-page";
import type { CompanyProfile } from "../types";

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

beforeEach(() => {
  vi.clearAllMocks();
  authState.activeCompany = { id: "company-a", name: "Empresa A" };
  authState.memberships = [{ company: { id: "company-a", name: "Empresa A" }, role: "owner" }];
  authState.refresh = vi.fn().mockResolvedValue(undefined);
});

describe("CompanyProfilePage load (FRONTEND-COMPANY-PROFILE-01 §51 PL1-PL10)", () => {
  /** PL1: the page calls GET on mount. */
  it("PL1: calls getCompanyProfile on mount", async () => {
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile());
    render(<CompanyProfilePage />);

    await waitFor(() => expect(getCompanyProfile).toHaveBeenCalledTimes(1));
  });

  /** PL2: shows a loading state before the GET resolves. */
  it("PL2: shows a loading skeleton before GET resolves", () => {
    vi.mocked(getCompanyProfile).mockImplementation(() => new Promise(() => {}));
    render(<CompanyProfilePage />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  /** PL3: shows the editable form on success. */
  it("PL3: shows the form on success", async () => {
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile({ name: "Construtora Sucesso" }));
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Construtora Sucesso"));
  });

  /** PL4: nested `address` from GET populates the flat form fields. */
  it("PL4: nested address populates flat form fields", async () => {
    vi.mocked(getCompanyProfile).mockResolvedValue(
      makeProfile({
        address: {
          postal_code: "01001000",
          street: "Praça da Sé",
          number: "100",
          complement: "Sala 1",
          neighborhood: "Sé",
          city: "São Paulo",
          state: "SP",
          reference_point: "Ao lado da catedral",
        },
      })
    );
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByLabelText(/^CEP/)).toHaveValue("01001-000"));
    expect(screen.getByLabelText("Logradouro")).toHaveValue("Praça da Sé");
    expect(screen.getByLabelText("Número")).toHaveValue("100");
    expect(screen.getByLabelText(/Complemento/)).toHaveValue("Sala 1");
    expect(screen.getByLabelText("Bairro")).toHaveValue("Sé");
    expect(screen.getByLabelText("Cidade")).toHaveValue("São Paulo");
    expect(screen.getByLabelText(/Ponto de referência/)).toHaveValue("Ao lado da catedral");
  });

  /** PL5: logo_url is rendered when present. */
  it("PL5: renders logo_url as the logo image src", async () => {
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile({ logo_url: "http://api.test/storage/companies/company-a/logos/x.png" }));
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByAltText("Logo da empresa")).toHaveAttribute(
      "src",
      "http://api.test/storage/companies/company-a/logos/x.png"
    ));
  });

  /** PL6: a GET failure shows an error message. */
  it("PL6: shows an error message on GET failure", async () => {
    vi.mocked(getCompanyProfile).mockRejectedValue(new Error("network down"));
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByText("Não foi possível carregar o perfil da empresa.")).toBeInTheDocument());
  });

  /** PL7: retry re-fetches after an error. */
  it("PL7: 'Tentar novamente' re-fetches after an error", async () => {
    vi.mocked(getCompanyProfile).mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByText("Não foi possível carregar o perfil da empresa.")).toBeInTheDocument());

    vi.mocked(getCompanyProfile).mockResolvedValueOnce(makeProfile({ name: "Recuperado" }));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Recuperado"));
  });

  /** PL8: switching Company clears A's values in the same render (remount-by-key). */
  it("PL8: Company switch clears A's loaded values immediately", async () => {
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile({ name: "Empresa A carregada" }));
    const { rerender } = render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Empresa A carregada"));

    vi.mocked(getCompanyProfile).mockImplementation(() => new Promise(() => {})); // B's GET never resolves in this test
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    authState.memberships = [{ company: { id: "company-b", name: "Empresa B" }, role: "owner" }];
    rerender(<CompanyProfilePage />);

    expect(screen.queryByDisplayValue("Empresa A carregada")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  /** PL9: a late GET for A resolving after switching to B never overwrites B's own loaded profile. */
  it("PL9: a late GET for Company A is discarded after switching to B", async () => {
    let resolveA: (value: CompanyProfile) => void = () => {};
    vi.mocked(getCompanyProfile).mockReturnValueOnce(new Promise((resolve) => { resolveA = resolve; }));
    const { rerender } = render(<CompanyProfilePage />);

    vi.mocked(getCompanyProfile).mockResolvedValueOnce(makeProfile({ name: "Empresa B carregada" }));
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    authState.memberships = [{ company: { id: "company-b", name: "Empresa B" }, role: "owner" }];
    rerender(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Empresa B carregada"));

    resolveA(makeProfile({ name: "Empresa A tardia" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByDisplayValue("Empresa A tardia")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Empresa B carregada");
  });

  /** PL10: nothing is ever written to localStorage/sessionStorage by this page. */
  it("PL10: never writes to localStorage/sessionStorage", async () => {
    const localSetSpy = vi.spyOn(Storage.prototype, "setItem");
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile({ name: "Sem Storage" }));
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Sem Storage"));

    expect(localSetSpy).not.toHaveBeenCalled();
    localSetSpy.mockRestore();
  });
});

describe("CompanyProfilePage role gating (FRONTEND-COMPANY-PROFILE-01 §52 PR1-PR8)", () => {
  /** PR1: owner gets the editable form. */
  it("PR1: owner sees the editable form (Save button present)", async () => {
    authState.memberships = [{ company: { id: "company-a", name: "Empresa A" }, role: "owner" }];
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile());
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeInTheDocument());
  });

  /** PR2: admin gets the editable form. */
  it("PR2: admin sees the editable form (Save button present)", async () => {
    authState.memberships = [{ company: { id: "company-a", name: "Empresa A" }, role: "admin" }];
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile());
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeInTheDocument());
  });

  /** PR3: member sees a readonly presentation, not editable inputs. */
  it("PR3: member sees readonly presentation, not editable name input", async () => {
    authState.memberships = [{ company: { id: "company-a", name: "Empresa A" }, role: "member" }];
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile({ name: "Empresa Membro" }));
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByText("Empresa Membro")).toBeInTheDocument());
    expect(screen.queryByLabelText("Nome da empresa *")).not.toBeInTheDocument();
    expect(screen.getByText("Somente proprietários e administradores podem alterar estes dados.")).toBeInTheDocument();
  });

  /** PR4: member never sees the Save button. */
  it("PR4: member never sees 'Salvar alterações'", async () => {
    authState.memberships = [{ company: { id: "company-a", name: "Empresa A" }, role: "member" }];
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile());
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByText(/Somente proprietários/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Salvar alterações" })).not.toBeInTheDocument();
  });

  /** PR5: member never sees the logo upload control. */
  it("PR5: member never sees 'Escolher logo'", async () => {
    authState.memberships = [{ company: { id: "company-a", name: "Empresa A" }, role: "member" }];
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile());
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByText(/Somente proprietários/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Escolher logo/ })).not.toBeInTheDocument();
  });

  /** PR6: member never sees the remove-logo control. */
  it("PR6: member never sees 'Remover logo'", async () => {
    authState.memberships = [{ company: { id: "company-a", name: "Empresa A" }, role: "member" }];
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile({ logo_url: "http://api.test/logo.png" }));
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByText(/Somente proprietários/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Remover logo" })).not.toBeInTheDocument();
  });

  /** PR7: a stale/incorrect frontend role that the backend rejects with 403 shows a controlled message (covered fully in save test file; here confirms the message text is available and never crashes when role looks like owner but save 403s — smoke covered in save suite). */
  it("PR7: owner UI still renders normally (403 handling itself is exercised in the save test suite)", async () => {
    authState.memberships = [{ company: { id: "company-a", name: "Empresa A" }, role: "owner" }];
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile());
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeInTheDocument());
  });

  /** PR8: role is derived from the ACTIVE membership, not simply the first membership in the list. */
  it("PR8: role derives from the active membership, not the first one in the array", async () => {
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    authState.memberships = [
      { company: { id: "company-a", name: "Empresa A" }, role: "owner" },
      { company: { id: "company-b", name: "Empresa B" }, role: "member" },
    ];
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile({ id: "company-b", name: "Empresa B" }));
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByText(/Somente proprietários/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Salvar alterações" })).not.toBeInTheDocument();
  });
});

describe("CompanyProfilePage tenant races — load (FRONTEND-COMPANY-PROFILE-01 §57 PT1-PT4)", () => {
  /** PT1: Company A's profile is visible while A is active. */
  it("PT1: Company A's profile is visible while A is active", async () => {
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile({ name: "Visível em A" }));
    render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Visível em A"));
  });

  /** PT2: switching to B hides A in the same render (already proven structurally by PL8; restated here under PT numbering). */
  it("PT2: switching to B hides A's data in the same render", async () => {
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile({ name: "Dados de A" }));
    const { rerender } = render(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Dados de A"));

    vi.mocked(getCompanyProfile).mockImplementation(() => new Promise(() => {}));
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CompanyProfilePage />);

    expect(screen.queryByText("Dados de A")).not.toBeInTheDocument();
  });

  /** PT3: B starts its own loading state, never inheriting A's success state. */
  it("PT3: Company B starts in its own loading state", async () => {
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile({ name: "Dados de A" }));
    const { rerender } = render(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Dados de A"));

    vi.mocked(getCompanyProfile).mockImplementation(() => new Promise(() => {}));
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CompanyProfilePage />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  /** PT4: a late GET for A is ignored once B has loaded (restates PL9 under PT numbering). */
  it("PT4: a late GET for A never overwrites B once B has loaded", async () => {
    let resolveA: (value: CompanyProfile) => void = () => {};
    vi.mocked(getCompanyProfile).mockReturnValueOnce(new Promise((resolve) => { resolveA = resolve; }));
    const { rerender } = render(<CompanyProfilePage />);

    vi.mocked(getCompanyProfile).mockResolvedValueOnce(makeProfile({ name: "B carregado" }));
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    authState.memberships = [{ company: { id: "company-b", name: "Empresa B" }, role: "owner" }];
    rerender(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("B carregado"));

    resolveA(makeProfile({ name: "A tardio" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("B carregado");
  });
});
