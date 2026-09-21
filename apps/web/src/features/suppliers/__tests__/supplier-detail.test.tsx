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
 * toggle-mutation tenant-race proof exactly.
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
