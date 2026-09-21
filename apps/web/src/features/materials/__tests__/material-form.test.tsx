import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiValidationError } from "@/lib/api-client";
import { MaterialForm } from "../material-form";
import type { Material } from "../types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

const reload = vi.fn();
const materialState: { material: Material | null | undefined; error: boolean } = {
  material: undefined,
  error: false,
};
vi.mock("../use-material", () => ({
  useMaterial: () => ({ material: materialState.material, error: materialState.error, reload }),
}));

vi.mock("../materials-client", () => ({
  createMaterial: vi.fn(),
  updateMaterial: vi.fn(),
}));

vi.mock("../prototype/material-local-dependencies", () => ({
  hasAnyLocalMaterialDependency: () => false,
}));

import { createMaterial, updateMaterial } from "../materials-client";

function material(overrides: Partial<Material> = {}): Material {
  return {
    id: "server-generated-uuid",
    name: "Cimento",
    unit_code: "sc",
    unit_custom_label: null,
    notes: null,
    active: true,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

describe("MaterialForm — SUPPLY-FRONTEND-01A1 §12/§17/§18", () => {
  beforeEach(() => {
    vi.mocked(createMaterial).mockReset();
    vi.mocked(updateMaterial).mockReset();
    reload.mockReset();
    push.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    materialState.material = undefined;
    materialState.error = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("§12: edit-load error shows a retry button wired to reload()", async () => {
    materialState.error = true;
    const user = userEvent.setup();
    render(<MaterialForm materialId="m1" />);
    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("MF9: create uses the server-returned UUID, never a browser-generated one", async () => {
    vi.mocked(createMaterial).mockResolvedValueOnce(material({ id: "server-generated-uuid" }));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<MaterialForm onSuccess={onSuccess} onCancel={() => {}} />);

    await user.type(screen.getByLabelText("Nome"), "Cimento");
    await user.click(screen.getByRole("button", { name: /salvar material/i }));

    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: "server-generated-uuid" }));
  });

  it("MF10: editing an existing Material calls updateMaterial (PUT), never createMaterial", async () => {
    materialState.material = material({ id: "m1" });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    vi.mocked(updateMaterial).mockResolvedValueOnce(material({ id: "m1", name: "Cimento CP-II" }));
    render(<MaterialForm materialId="m1" onSuccess={onSuccess} onCancel={() => {}} />);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    expect(updateMaterial).toHaveBeenCalledWith("m1", expect.any(Object));
    expect(createMaterial).not.toHaveBeenCalled();
  });

  it("MF12: an edit-load 404 (material === null) is distinct from a network/error load, never rendered as the retry-error state", async () => {
    materialState.material = null;
    materialState.error = false;
    render(<MaterialForm materialId="m1" />);
    expect(screen.getByText(/material não encontrado/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tentar novamente/i })).not.toBeInTheDocument();
  });

  it("MF16: a backend 422 validation error is shown inline", async () => {
    const user = userEvent.setup();
    vi.mocked(createMaterial).mockRejectedValueOnce(new ApiValidationError({ name: ["Nome já cadastrado."] }, null));

    render(<MaterialForm onCancel={() => {}} />);
    await user.type(screen.getByLabelText("Nome"), "Cimento");
    await user.click(screen.getByRole("button", { name: /salvar material/i }));

    expect(await screen.findByText("Nome já cadastrado.")).toBeInTheDocument();
  });

  it("§18: a quick-create POST for Company A resolving after switching to B never fires onSuccess", async () => {
    let resolveCreate!: (value: Material) => void;
    vi.mocked(createMaterial).mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve; }));
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(<MaterialForm onSuccess={onSuccess} onCancel={() => {}} />);
    await user.type(screen.getByLabelText("Nome"), "Cimento");
    await user.click(screen.getByRole("button", { name: /salvar material/i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<MaterialForm onSuccess={onSuccess} onCancel={() => {}} />);

    resolveCreate(material());
    await new Promise((r) => setTimeout(r, 0));

    expect(onSuccess).not.toHaveBeenCalled();
  });
});
