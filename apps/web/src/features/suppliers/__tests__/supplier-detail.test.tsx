import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiNetworkError } from "@/lib/api-client";
import { SupplierDetail } from "../supplier-detail";
import type { Supplier } from "../types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

const reload = vi.fn();
const supplierState: { supplier: Supplier | null | undefined; error: boolean } = {
  supplier: undefined,
  error: false,
};
vi.mock("../use-supplier", () => ({
  useSupplier: () => ({ supplier: supplierState.supplier, error: supplierState.error, reload }),
}));

vi.mock("../suppliers-client", () => ({
  updateSupplier: vi.fn(),
}));

import { updateSupplier } from "../suppliers-client";

function supplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: "s1",
    name: "Casa Silva",
    document: null,
    contact_name: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    active: true,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

/**
 * SUPPLY-FRONTEND-01A1 §10/§21. SupplierDetail mirrors MaterialDetail's
 * toggle-mutation tenant-race proof exactly. Kept from 01A1 — still holds
 * after the 01A2 remount fix.
 */
describe("SupplierDetail toggle tenant ownership — SUPPLY-FRONTEND-01A1 §10/§21", () => {
  beforeEach(() => {
    vi.mocked(updateSupplier).mockReset();
    reload.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    supplierState.supplier = supplier();
    supplierState.error = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("a toggle whose PUT resolves after the Company switched never calls reload()", async () => {
    const user = userEvent.setup();
    let resolveUpdate!: (value: Supplier) => void;
    vi.mocked(updateSupplier).mockReturnValueOnce(new Promise((resolve) => { resolveUpdate = resolve; }));

    const { rerender } = render(<SupplierDetail id="s1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<SupplierDetail id="s1" />);

    resolveUpdate(supplier({ active: false }));
    await new Promise((r) => setTimeout(r, 0));

    expect(reload).not.toHaveBeenCalled();
  });

  it("a toggle whose PUT rejects after the Company switched never writes toggleError", async () => {
    const user = userEvent.setup();
    let rejectUpdate!: (error: unknown) => void;
    vi.mocked(updateSupplier).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectUpdate = reject; }));

    const { rerender } = render(<SupplierDetail id="s1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<SupplierDetail id="s1" />);

    rejectUpdate(new ApiNetworkError());
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText(/não foi possível atualizar agora/i)).not.toBeInTheDocument();
  });
});

/**
 * SUPPLY-FRONTEND-01A2 §5/§6/§7. The actual blocker this round closes —
 * mirrors `material-detail.test.tsx` exactly.
 */
describe("SupplierDetail detail mutation state ownership — SUPPLY-FRONTEND-01A2 §5/§6/§7", () => {
  beforeEach(() => {
    vi.mocked(updateSupplier).mockReset();
    reload.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    supplierState.supplier = supplier();
    supplierState.error = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("§5: a pending toggle under Company A/Supplier A never leaves Supplier B's toggle button disabled after switching to B", async () => {
    const user = userEvent.setup();
    let resolveUpdate!: (value: Supplier) => void;
    vi.mocked(updateSupplier).mockReturnValueOnce(new Promise((resolve) => { resolveUpdate = resolve; }));

    const { rerender } = render(<SupplierDetail id="s1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));
    expect(screen.getByRole("button", { name: /inativar/i })).toBeDisabled();

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    supplierState.supplier = supplier({ id: "s2", name: "Fornecedor B" });
    rerender(<SupplierDetail id="s2" />);

    expect(screen.getByRole("button", { name: /inativar/i })).not.toBeDisabled();

    resolveUpdate(supplier({ active: false }));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByRole("button", { name: /inativar/i })).not.toBeDisabled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("§6: an existing toggleError shown under Company A never appears on Supplier B's render after switching to B", async () => {
    const user = userEvent.setup();
    vi.mocked(updateSupplier).mockRejectedValueOnce(new ApiNetworkError());

    const { rerender } = render(<SupplierDetail id="s1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));
    await screen.findByText(/não foi possível atualizar agora/i);

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    supplierState.supplier = supplier({ id: "s2", name: "Fornecedor B" });
    rerender(<SupplierDetail id="s2" />);

    expect(screen.queryByText(/não foi possível atualizar agora/i)).not.toBeInTheDocument();
  });

  it("§7: same Company, id switch A→B clears a pending toggling flag and an existing toggleError", async () => {
    const user = userEvent.setup();
    vi.mocked(updateSupplier).mockReturnValueOnce(new Promise(() => {}));

    const { rerender } = render(<SupplierDetail id="s1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));
    expect(screen.getByRole("button", { name: /inativar/i })).toBeDisabled();

    supplierState.supplier = supplier({ id: "s2", name: "Fornecedor B" });
    rerender(<SupplierDetail id="s2" />);

    expect(screen.getByRole("button", { name: /inativar/i })).not.toBeDisabled();
    expect(screen.queryByText(/não foi possível atualizar agora/i)).not.toBeInTheDocument();
  });
});

/**
 * SUPPLY-FRONTEND-01A2 §8. The fix must not break the normal, same-
 * Company/same-id flow.
 */
describe("SupplierDetail current-request regression — SUPPLY-FRONTEND-01A2 §8", () => {
  beforeEach(() => {
    vi.mocked(updateSupplier).mockReset();
    reload.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    supplierState.supplier = supplier();
    supplierState.error = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("a normal (non-stale) success calls reload() and re-enables the button", async () => {
    const user = userEvent.setup();
    vi.mocked(updateSupplier).mockResolvedValueOnce(supplier({ active: false }));

    render(<SupplierDetail id="s1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));

    await new Promise((r) => setTimeout(r, 0));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /inativar/i })).not.toBeDisabled();
  });

  it("a normal (non-stale) error keeps showing the message", async () => {
    const user = userEvent.setup();
    vi.mocked(updateSupplier).mockRejectedValueOnce(new ApiNetworkError());

    render(<SupplierDetail id="s1" />);
    await user.click(screen.getByRole("button", { name: /inativar/i }));

    expect(await screen.findByText(/não foi possível atualizar agora/i)).toBeInTheDocument();
  });
});

/** SUPPLY-FRONTEND-01A1 §13 companion — SupplierDetail's own load-error retry already existed via `reload`. */
describe("SupplierDetail load error", () => {
  beforeEach(() => {
    reload.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  it("shows a retry button that calls reload()", async () => {
    supplierState.supplier = undefined;
    supplierState.error = true;
    const user = userEvent.setup();
    render(<SupplierDetail id="s1" />);
    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
