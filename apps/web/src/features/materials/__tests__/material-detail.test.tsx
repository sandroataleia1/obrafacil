import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiNetworkError } from "@/lib/api-client";
import { MaterialDetail } from "../material-detail";
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
  updateMaterial: vi.fn(),
}));

import { updateMaterial } from "../materials-client";

function material(overrides: Partial<Material> = {}): Material {
  return {
    id: "m1",
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

/**
 * SUPPLY-FRONTEND-01A1 §9/§21. MaterialDetail toggle-mutation tenant-race
 * proof: a toggle started under Company A must never write reload/error
 * state once the active Company (or the id) has changed by the time the
 * PUT settles. Kept from 01A1 — still holds after the 01A2 remount fix.
 */
describe("MaterialDetail toggle tenant ownership — SUPPLY-FRONTEND-01A1 §9/§21", () => {
  beforeEach(() => {
    vi.mocked(updateMaterial).mockReset();
    reload.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    materialState.material = material();
    materialState.error = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("a toggle whose PUT resolves after the Company switched never calls reload()", async () => {
    const user = userEvent.setup();
    let resolveUpdate!: (value: Material) => void;
    vi.mocked(updateMaterial).mockReturnValueOnce(new Promise((resolve) => { resolveUpdate = resolve; }));

    const { rerender } = render(<MaterialDetail id="m1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<MaterialDetail id="m1" />);

    resolveUpdate(material({ active: false }));
    await new Promise((r) => setTimeout(r, 0));

    expect(reload).not.toHaveBeenCalled();
  });

  it("a toggle whose PUT rejects after the Company switched never writes toggleError", async () => {
    const user = userEvent.setup();
    let rejectUpdate!: (error: unknown) => void;
    vi.mocked(updateMaterial).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectUpdate = reject; }));

    const { rerender } = render(<MaterialDetail id="m1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<MaterialDetail id="m1" />);

    rejectUpdate(new ApiNetworkError());
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText(/não foi possível atualizar agora/i)).not.toBeInTheDocument();
  });

  it("a toggle whose PUT resolves after the id changed (navigated to another Material) never calls reload()", async () => {
    const user = userEvent.setup();
    let resolveUpdate!: (value: Material) => void;
    vi.mocked(updateMaterial).mockReturnValueOnce(new Promise((resolve) => { resolveUpdate = resolve; }));

    const { rerender } = render(<MaterialDetail id="m1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));

    materialState.material = material({ id: "m2", name: "Areia" });
    rerender(<MaterialDetail id="m2" />);

    resolveUpdate(material({ active: false }));
    await new Promise((r) => setTimeout(r, 0));

    expect(reload).not.toHaveBeenCalled();
  });
});

/**
 * SUPPLY-FRONTEND-01A2 §4/§6/§7. The actual blocker this round closes:
 * the stale-request guard alone (01A1) never cleared `toggling`/
 * `toggleError` already sitting in state for the OLD Company/Material —
 * only the outer-wrapper + keyed-Inner remount does that, by construction
 * (a fresh `useState(false)`/`useState(null)` on every Company/id switch).
 */
describe("MaterialDetail detail mutation state ownership — SUPPLY-FRONTEND-01A2 §4/§6/§7", () => {
  beforeEach(() => {
    vi.mocked(updateMaterial).mockReset();
    reload.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    materialState.material = material();
    materialState.error = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("§4: a pending toggle under Company A/Material A never leaves Material B's toggle button disabled after switching to B", async () => {
    const user = userEvent.setup();
    let resolveUpdate!: (value: Material) => void;
    vi.mocked(updateMaterial).mockReturnValueOnce(new Promise((resolve) => { resolveUpdate = resolve; }));

    const { rerender } = render(<MaterialDetail id="m1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));
    expect(screen.getByRole("button", { name: /inativar/i })).toBeDisabled();

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    materialState.material = material({ id: "m2", name: "Areia B" });
    rerender(<MaterialDetail id="m2" />);

    // Before A's PUT resolves: B's own toggle button must already be enabled.
    expect(screen.getByRole("button", { name: /inativar/i })).not.toBeDisabled();

    resolveUpdate(material({ active: false }));
    await new Promise((r) => setTimeout(r, 0));

    // After A's PUT resolves: still enabled, zero reload triggered by A.
    expect(screen.getByRole("button", { name: /inativar/i })).not.toBeDisabled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("§6: an existing toggleError shown under Company A never appears on Material B's render after switching to B", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMaterial).mockRejectedValueOnce(new ApiNetworkError());

    const { rerender } = render(<MaterialDetail id="m1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));
    await screen.findByText(/não foi possível atualizar agora/i);

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    materialState.material = material({ id: "m2", name: "Areia B" });
    rerender(<MaterialDetail id="m2" />);

    expect(screen.queryByText(/não foi possível atualizar agora/i)).not.toBeInTheDocument();
  });

  it("§7: same Company, id switch A→B clears a pending toggling flag and an existing toggleError", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMaterial).mockReturnValueOnce(new Promise(() => {}));

    const { rerender } = render(<MaterialDetail id="m1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));
    expect(screen.getByRole("button", { name: /inativar/i })).toBeDisabled();

    materialState.material = material({ id: "m2", name: "Areia B" });
    rerender(<MaterialDetail id="m2" />);

    expect(screen.getByRole("button", { name: /inativar/i })).not.toBeDisabled();
    expect(screen.queryByText(/não foi possível atualizar agora/i)).not.toBeInTheDocument();
  });
});

/**
 * SUPPLY-FRONTEND-01A2 §8. The fix must not break the normal, same-
 * Company/same-id flow: a real success still reloads and re-enables, a
 * real error is still shown.
 */
describe("MaterialDetail current-request regression — SUPPLY-FRONTEND-01A2 §8", () => {
  beforeEach(() => {
    vi.mocked(updateMaterial).mockReset();
    reload.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    materialState.material = material();
    materialState.error = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("a normal (non-stale) success calls reload() and re-enables the button", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMaterial).mockResolvedValueOnce(material({ active: false }));

    render(<MaterialDetail id="m1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));

    await new Promise((r) => setTimeout(r, 0));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /inativar/i })).not.toBeDisabled();
  });

  it("a normal (non-stale) error keeps showing the message", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMaterial).mockRejectedValueOnce(new ApiNetworkError());

    render(<MaterialDetail id="m1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));

    expect(await screen.findByText(/não foi possível atualizar agora/i)).toBeInTheDocument();
  });
});

/** SUPPLY-FRONTEND-01A1 §12 companion — MaterialDetail's own load-error retry already existed via `reload`. */
describe("MaterialDetail load error", () => {
  beforeEach(() => {
    reload.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  it("shows a retry button that calls reload()", async () => {
    materialState.material = undefined;
    materialState.error = true;
    const user = userEvent.setup();
    render(<MaterialDetail id="m1" />);
    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
