import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyProfilePage } from "../company-profile-page";
import { ApiError, ApiValidationError } from "@/lib/api-client";
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

import { getCompanyProfile, updateCompanyProfile } from "../company-profile-client";

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

async function renderLoaded() {
  vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile());
  render(<CompanyProfilePage />);
  await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toBeInTheDocument());
}

describe("CompanyProfilePage save (FRONTEND-COMPANY-PROFILE-01 §53 PS1-PS14)", () => {
  /** PS1: a full PUT is sent (all fields, including timezone). */
  it("PS1: sends a full PUT with all fields", async () => {
    vi.mocked(updateCompanyProfile).mockResolvedValue(makeProfile({ name: "Nova Empresa" }));
    const user = userEvent.setup();
    await renderLoaded();

    await user.clear(screen.getByLabelText("Nome da empresa *"));
    await user.type(screen.getByLabelText("Nome da empresa *"), "Nova Empresa");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateCompanyProfile).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateCompanyProfile).mock.calls[0]![0];
    expect(payload).toHaveProperty("name", "Nova Empresa");
    expect(payload).toHaveProperty("timezone", "America/Sao_Paulo");
  });

  /** PS2: address fields are sent flat (postal_code/street/... at top level). */
  it("PS2: sends flat postal_code/street/... fields", async () => {
    vi.mocked(updateCompanyProfile).mockResolvedValue(makeProfile());
    const user = userEvent.setup();
    await renderLoaded();

    await user.type(screen.getByLabelText(/^CEP/), "01001000");
    await user.type(screen.getByLabelText("Logradouro"), "Praça da Sé");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateCompanyProfile).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateCompanyProfile).mock.calls[0]![0];
    expect(payload.postal_code).toBe("01001000");
    expect(payload.street).toBe("Praça da Sé");
  });

  /** PS3: the payload never contains a nested `address` key. */
  it("PS3: never sends a nested address object", async () => {
    vi.mocked(updateCompanyProfile).mockResolvedValue(makeProfile());
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateCompanyProfile).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateCompanyProfile).mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty("address");
  });

  /** PS4: the payload never contains company_id. */
  it("PS4: never sends company_id", async () => {
    vi.mocked(updateCompanyProfile).mockResolvedValue(makeProfile());
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateCompanyProfile).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateCompanyProfile).mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty("company_id");
  });

  /** PS5: the payload never contains id. */
  it("PS5: never sends id", async () => {
    vi.mocked(updateCompanyProfile).mockResolvedValue(makeProfile());
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateCompanyProfile).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateCompanyProfile).mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty("id");
  });

  /** PS6: CNPJ is sent digits-only. */
  it("PS6: CNPJ is sent digits-only", async () => {
    vi.mocked(updateCompanyProfile).mockResolvedValue(makeProfile());
    const user = userEvent.setup();
    await renderLoaded();

    await user.type(screen.getByLabelText("CNPJ (opcional)"), "11222333000181");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateCompanyProfile).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateCompanyProfile).mock.calls[0]![0];
    expect(payload.document).toBe("11222333000181");
  });

  /** PS7: phone is sent as E.164. */
  it("PS7: phone is sent as E.164", async () => {
    vi.mocked(updateCompanyProfile).mockResolvedValue(makeProfile());
    const user = userEvent.setup();
    await renderLoaded();

    await user.type(screen.getByLabelText("Telefone (opcional)"), "11987654321");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateCompanyProfile).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateCompanyProfile).mock.calls[0]![0];
    expect(payload.phone).toBe("+5511987654321");
  });

  /** PS8: whatsapp is sent as E.164. */
  it("PS8: whatsapp is sent as E.164", async () => {
    vi.mocked(updateCompanyProfile).mockResolvedValue(makeProfile());
    const user = userEvent.setup();
    await renderLoaded();

    await user.type(screen.getByLabelText("WhatsApp (opcional)"), "11987654322");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateCompanyProfile).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateCompanyProfile).mock.calls[0]![0];
    expect(payload.whatsapp).toBe("+5511987654322");
  });

  /** PS9: UF is sent uppercase. */
  it("PS9: UF is sent uppercase", async () => {
    vi.mocked(updateCompanyProfile).mockResolvedValue(makeProfile());
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(document.getElementById("company-address-state")!);
    await user.click(await screen.findByRole("option", { name: "SP" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateCompanyProfile).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateCompanyProfile).mock.calls[0]![0];
    expect(payload.state).toBe("SP");
  });

  /** PS10: an empty optional field is sent as null, never whitespace/"". */
  it("PS10: empty optional fields are sent as null", async () => {
    vi.mocked(updateCompanyProfile).mockResolvedValue(makeProfile());
    const user = userEvent.setup();
    await renderLoaded();

    await user.type(screen.getByLabelText("Razão social (opcional)"), "   ");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateCompanyProfile).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateCompanyProfile).mock.calls[0]![0];
    expect(payload.legal_name).toBeNull();
    expect(payload.trade_name).toBeNull();
    expect(payload.document).toBeNull();
    expect(payload.phone).toBeNull();
    expect(payload.email).toBeNull();
  });

  /** PS11: 422 field errors are mapped near their fields. */
  it("PS11: maps 422 field errors near their fields", async () => {
    vi.mocked(updateCompanyProfile).mockRejectedValue(
      new ApiValidationError({ name: ["Nome inválido."], email: ["E-mail inválido."] })
    );
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByText("Nome inválido.")).toBeInTheDocument());
    expect(screen.getByText("E-mail inválido.")).toBeInTheDocument();
    // Draft remains — the name input still shows what the user had.
    expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Empresa A");
  });

  /** PS12: double-clicking Save sends exactly one PUT. */
  it("PS12: double-click sends exactly one PUT", async () => {
    let resolvePut: (value: CompanyProfile) => void = () => {};
    vi.mocked(updateCompanyProfile).mockImplementation(() => new Promise((resolve) => { resolvePut = resolve; }));
    const user = userEvent.setup();
    await renderLoaded();

    const saveButton = screen.getByRole("button", { name: "Salvar alterações" });
    await user.click(saveButton);
    expect(screen.getByRole("button", { name: "Salvando..." })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Salvando..." }));

    expect(updateCompanyProfile).toHaveBeenCalledTimes(1);
    resolvePut(makeProfile());
  });

  /** PS13: on success, the server's CompanyProfile response becomes the new canonical form state. */
  it("PS13: success uses the server response as the new canonical state", async () => {
    vi.mocked(updateCompanyProfile).mockResolvedValue(makeProfile({ name: "Nome Canônico Do Servidor" }));
    const user = userEvent.setup();
    await renderLoaded();

    await user.clear(screen.getByLabelText("Nome da empresa *"));
    await user.type(screen.getByLabelText("Nome da empresa *"), "Nome Digitado Localmente");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Nome Canônico Do Servidor"));
    expect(screen.getByText("Perfil atualizado.")).toBeInTheDocument();
  });

  /** PS14: a name change triggers auth.refresh() so the shell/switcher picks up the new name — same tenant only. */
  it("PS14: a successful save (same tenant) calls auth.refresh()", async () => {
    vi.mocked(updateCompanyProfile).mockResolvedValue(makeProfile({ name: "Nome Renovado" }));
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(authState.refresh).toHaveBeenCalledTimes(1));
  });

  /** 403 from a stale/incorrect frontend role shows a controlled message (PR7 completion). */
  it("PS-403: a 403 on save shows the controlled permission message", async () => {
    vi.mocked(updateCompanyProfile).mockRejectedValue(new ApiError(403, "Forbidden"));
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(screen.getByText("Você não tem permissão para alterar o perfil da empresa.")).toBeInTheDocument()
    );
  });
});

describe("CompanyProfilePage tenant race — save (FRONTEND-COMPANY-PROFILE-01 §57 PT5)", () => {
  /** PT5: a stale PUT success/error for A resolving after switching to B never updates B, never shows "Perfil atualizado."/error in B, and never calls auth.refresh() as a visual side effect of B. */
  it("PT5: a stale PUT for A never affects Company B", async () => {
    let resolvePut: (value: CompanyProfile) => void = () => {};
    vi.mocked(updateCompanyProfile).mockImplementation(() => new Promise((resolve) => { resolvePut = resolve; }));
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile());
    const user = userEvent.setup();
    const { rerender } = render(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    // Switch to B WHILE A's PUT is in flight (remounts the inner component).
    vi.mocked(getCompanyProfile).mockImplementation(() => new Promise(() => {}));
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    authState.memberships = [{ company: { id: "company-b", name: "Empresa B" }, role: "owner" }];
    rerender(<CompanyProfilePage />);

    resolvePut(makeProfile({ name: "A atualizado tarde demais" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Perfil atualizado.")).not.toBeInTheDocument();
    expect(screen.queryByText("A atualizado tarde demais")).not.toBeInTheDocument();
    // auth.refresh was reset in beforeEach and never called by this stale continuation.
    expect(authState.refresh).not.toHaveBeenCalled();
  });
});
