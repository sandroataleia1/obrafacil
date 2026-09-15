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

import { deleteCompanyLogo, getCompanyProfile, uploadCompanyLogo } from "../company-profile-client";

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

function pngFile(name = "logo.png", sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: "image/png" });
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

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]')!;
}

describe("CompanyProfilePage logo (FRONTEND-COMPANY-PROFILE-01 §56 LG1-LG14)", () => {
  /** LG1: PNG upload sends FormData. */
  it("LG1: PNG upload calls uploadCompanyLogo with a File", async () => {
    vi.mocked(uploadCompanyLogo).mockResolvedValue(makeProfile({ logo_url: "http://api.test/logo.png" }));
    const user = userEvent.setup();
    await renderLoaded();

    const file = pngFile("logo.png");
    await user.upload(fileInput(), file);

    await waitFor(() => expect(uploadCompanyLogo).toHaveBeenCalledWith(file));
  });

  /** LG2: JPEG accepted client-side. */
  it("LG2: JPEG is accepted client-side", async () => {
    vi.mocked(uploadCompanyLogo).mockResolvedValue(makeProfile({ logo_url: "http://api.test/logo.jpg" }));
    const user = userEvent.setup();
    await renderLoaded();

    const file = new File([new Uint8Array(1024)], "logo.jpg", { type: "image/jpeg" });
    await user.upload(fileInput(), file);

    await waitFor(() => expect(uploadCompanyLogo).toHaveBeenCalledWith(file));
  });

  /** LG3: WebP accepted client-side. */
  it("LG3: WebP is accepted client-side", async () => {
    vi.mocked(uploadCompanyLogo).mockResolvedValue(makeProfile({ logo_url: "http://api.test/logo.webp" }));
    const user = userEvent.setup();
    await renderLoaded();

    const file = new File([new Uint8Array(1024)], "logo.webp", { type: "image/webp" });
    await user.upload(fileInput(), file);

    await waitFor(() => expect(uploadCompanyLogo).toHaveBeenCalledWith(file));
  });

  /**
   * LG4: SVG blocked client-side, never even reaches the client function.
   * `applyAccept: false` bypasses userEvent's own `accept`-attribute
   * filtering (which would otherwise silently drop the file before it
   * ever reaches the input, the same real protection the browser itself
   * provides) — this proves the JS-level defense-in-depth check
   * (`validateLogoFileLocally`) independently catches it too, for a
   * file that reached the input some other way (e.g. drag-and-drop).
   */
  it("LG4: SVG is blocked locally, before any request", async () => {
    const user = userEvent.setup({ applyAccept: false });
    await renderLoaded();

    const file = new File([new Uint8Array(1024)], "logo.svg", { type: "image/svg+xml" });
    await user.upload(fileInput(), file);

    await waitFor(() => expect(screen.getByText("Envie um arquivo PNG, JPG ou WebP.")).toBeInTheDocument());
    expect(uploadCompanyLogo).not.toHaveBeenCalled();
  });

  /** LG5: a file over 2MB is blocked locally. */
  it("LG5: a file over 2MB is blocked locally", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    const file = pngFile("big.png", 2 * 1024 * 1024 + 1);
    await user.upload(fileInput(), file);

    await waitFor(() => expect(screen.getByText("O arquivo deve ter no máximo 2 MB.")).toBeInTheDocument());
    expect(uploadCompanyLogo).not.toHaveBeenCalled();
  });

  /** LG6: a server-side 422 is shown. */
  it("LG6: a server 422 is shown", async () => {
    vi.mocked(uploadCompanyLogo).mockRejectedValue(new ApiValidationError({ logo: ["Arquivo inválido."] }));
    const user = userEvent.setup();
    await renderLoaded();

    await user.upload(fileInput(), pngFile());

    await waitFor(() => expect(screen.getByText("Arquivo inválido.")).toBeInTheDocument());
  });

  /** LG7: success uses the returned logo_url. */
  it("LG7: success renders the returned logo_url", async () => {
    vi.mocked(uploadCompanyLogo).mockResolvedValue(makeProfile({ logo_url: "http://api.test/storage/companies/company-a/logos/abc.png" }));
    const user = userEvent.setup();
    await renderLoaded();

    await user.upload(fileInput(), pngFile());

    await waitFor(() =>
      expect(screen.getByAltText("Logo da empresa")).toHaveAttribute(
        "src",
        "http://api.test/storage/companies/company-a/logos/abc.png"
      )
    );
  });

  /** LG8: the frontend never constructs a logo URL itself — always exactly what the server returned. */
  it("LG8: never builds a logo URL manually (verbatim server value, no concatenation)", async () => {
    const serverUrl = "https://cdn.example/weird-path/x.webp";
    vi.mocked(uploadCompanyLogo).mockResolvedValue(makeProfile({ logo_url: serverUrl }));
    const user = userEvent.setup();
    await renderLoaded();

    await user.upload(fileInput(), pngFile());

    await waitFor(() => expect(screen.getByAltText("Logo da empresa")).toHaveAttribute("src", serverUrl));
  });

  /** LG9: delete requires confirmation. */
  it("LG9: delete shows a confirmation dialog before calling the API", async () => {
    const user = userEvent.setup();
    await renderLoaded({ logo_url: "http://api.test/logo.png" });

    await user.click(screen.getByRole("button", { name: "Remover logo" }));

    expect(screen.getByText("Remover a logo da empresa?")).toBeInTheDocument();
    expect(deleteCompanyLogo).not.toHaveBeenCalled();
  });

  /** LG10: confirming delete succeeds and clears the logo. */
  it("LG10: confirming delete succeeds", async () => {
    vi.mocked(deleteCompanyLogo).mockResolvedValue(makeProfile({ logo_url: null }));
    const user = userEvent.setup();
    await renderLoaded({ logo_url: "http://api.test/logo.png" });

    await user.click(screen.getByRole("button", { name: "Remover logo" }));
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    await waitFor(() => expect(screen.queryByAltText("Logo da empresa")).not.toBeInTheDocument());
  });

  /** LG11: a stale upload success for A never paints a logo in B. */
  it("LG11: a stale upload success for A is ignored after switching to B", async () => {
    let resolveUpload: (value: CompanyProfile) => void = () => {};
    vi.mocked(uploadCompanyLogo).mockImplementation(() => new Promise((resolve) => { resolveUpload = resolve; }));
    const user = userEvent.setup();
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile());
    const { rerender } = render(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toBeInTheDocument());

    await user.upload(fileInput(), pngFile());

    vi.mocked(getCompanyProfile).mockResolvedValueOnce(makeProfile({ id: "company-b", name: "Empresa B" }));
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    authState.memberships = [{ company: { id: "company-b", name: "Empresa B" }, role: "owner" }];
    rerender(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Empresa B"));

    resolveUpload(makeProfile({ id: "company-a", logo_url: "http://api.test/leaked-into-b.png" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByAltText("Logo da empresa")).not.toBeInTheDocument();
  });

  /** LG12: a stale delete success for A never affects B's rendered logo. */
  it("LG12: a stale delete success for A is ignored after switching to B", async () => {
    let resolveDelete: (value: CompanyProfile) => void = () => {};
    vi.mocked(deleteCompanyLogo).mockImplementation(() => new Promise((resolve) => { resolveDelete = resolve; }));
    const user = userEvent.setup();
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile({ logo_url: "http://api.test/a-logo.png" }));
    const { rerender } = render(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Remover logo" }));
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    vi.mocked(getCompanyProfile).mockResolvedValueOnce(
      makeProfile({ id: "company-b", name: "Empresa B", logo_url: "http://api.test/b-logo.png" })
    );
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    authState.memberships = [{ company: { id: "company-b", name: "Empresa B" }, role: "owner" }];
    rerender(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByAltText("Logo da empresa")).toHaveAttribute("src", "http://api.test/b-logo.png"));

    resolveDelete(makeProfile({ id: "company-a", logo_url: null }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // B's own logo is untouched by A's stale delete resolving late.
    expect(screen.getByAltText("Logo da empresa")).toHaveAttribute("src", "http://api.test/b-logo.png");
  });

  /** LG13: double upload while one is in flight is blocked (button disabled). */
  it("LG13: the upload control is disabled while an upload is in flight", async () => {
    vi.mocked(uploadCompanyLogo).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    await renderLoaded();

    await user.upload(fileInput(), pngFile());

    await waitFor(() => expect(screen.getByRole("button", { name: "Enviando..." })).toBeDisabled());
  });

  /** LG14: a plain member never sees upload/replace/remove controls. */
  it("LG14: a member sees the logo but no upload/remove controls", async () => {
    authState.memberships = [{ company: { id: "company-a", name: "Empresa A" }, role: "member" }];
    await renderLoaded_asMember();

    async function renderLoaded_asMember() {
      vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile({ logo_url: "http://api.test/logo.png" }));
      render(<CompanyProfilePage />);
      await waitFor(() => expect(screen.getByAltText("Logo da empresa")).toBeInTheDocument());
    }

    expect(screen.queryByRole("button", { name: /Escolher logo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover logo" })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });

  /** A 403 on upload (stale/incorrect frontend role) shows the controlled message. */
  it("LG-403: a 403 on upload shows the controlled permission message", async () => {
    vi.mocked(uploadCompanyLogo).mockRejectedValue(new ApiError(403, "Forbidden"));
    const user = userEvent.setup();
    await renderLoaded();

    await user.upload(fileInput(), pngFile());

    await waitFor(() =>
      expect(screen.getByText("Você não tem permissão para alterar o perfil da empresa.")).toBeInTheDocument()
    );
  });
});

describe("CompanyProfilePage tenant races — logo (FRONTEND-COMPANY-PROFILE-01 §57 PT6-PT8)", () => {
  /** PT6: a late upload for A is ignored (restates LG11 under PT numbering). */
  it("PT6: a late logo upload for A is ignored after switching to B", async () => {
    let resolveUpload: (value: CompanyProfile) => void = () => {};
    vi.mocked(uploadCompanyLogo).mockImplementation(() => new Promise((resolve) => { resolveUpload = resolve; }));
    const user = userEvent.setup();
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile());
    const { rerender } = render(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toBeInTheDocument());

    await user.upload(fileInput(), pngFile());

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    authState.memberships = [{ company: { id: "company-b", name: "Empresa B" }, role: "owner" }];
    vi.mocked(getCompanyProfile).mockResolvedValueOnce(makeProfile({ id: "company-b", name: "Empresa B" }));
    rerender(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Empresa B"));

    resolveUpload(makeProfile({ logo_url: "http://api.test/should-not-appear.png" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByAltText("Logo da empresa")).not.toBeInTheDocument();
  });

  /** PT7: a late delete for A is ignored (restates LG12 under PT numbering). */
  it("PT7: a late logo delete for A is ignored after switching to B", async () => {
    let resolveDelete: (value: CompanyProfile) => void = () => {};
    vi.mocked(deleteCompanyLogo).mockImplementation(() => new Promise((resolve) => { resolveDelete = resolve; }));
    const user = userEvent.setup();
    vi.mocked(getCompanyProfile).mockResolvedValue(makeProfile({ logo_url: "http://api.test/a.png" }));
    const { rerender } = render(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByAltText("Logo da empresa")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Remover logo" }));
    await user.click(screen.getByRole("button", { name: "Confirmar remoção" }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    authState.memberships = [{ company: { id: "company-b", name: "Empresa B" }, role: "owner" }];
    vi.mocked(getCompanyProfile).mockResolvedValueOnce(makeProfile({ id: "company-b", name: "Empresa B", logo_url: "http://api.test/b.png" }));
    rerender(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByAltText("Logo da empresa")).toHaveAttribute("src", "http://api.test/b.png"));

    resolveDelete(makeProfile({ logo_url: null }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByAltText("Logo da empresa")).toHaveAttribute("src", "http://api.test/b.png");
  });

  /** PT8: B's own loading/error/success state is exclusively its own — proven across the whole suite (load/save/cnpj/cep/logo files); this is a final smoke confirming a fresh B mount never carries ANY leftover UI state from A. */
  it("PT8: Company B's UI state is fully independent from A's (no leaked loading/error/success)", async () => {
    vi.mocked(getCompanyProfile).mockRejectedValueOnce(new Error("A failed"));
    const { rerender } = render(<CompanyProfilePage />);
    await waitFor(() => expect(screen.getByText("Não foi possível carregar o perfil da empresa.")).toBeInTheDocument());

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    authState.memberships = [{ company: { id: "company-b", name: "Empresa B" }, role: "owner" }];
    vi.mocked(getCompanyProfile).mockResolvedValueOnce(makeProfile({ id: "company-b", name: "Empresa B" }));
    rerender(<CompanyProfilePage />);

    await waitFor(() => expect(screen.getByLabelText("Nome da empresa *")).toHaveValue("Empresa B"));
    expect(screen.queryByText("Não foi possível carregar o perfil da empresa.")).not.toBeInTheDocument();
  });
});
