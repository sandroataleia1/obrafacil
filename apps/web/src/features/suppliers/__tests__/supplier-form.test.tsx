import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiValidationError } from "@/lib/api-client";
import { SupplierForm } from "../supplier-form";
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
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
}));

import { createSupplier, updateSupplier } from "../suppliers-client";

function supplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: "server-generated-uuid",
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

describe("SupplierForm — SUPPLY-FRONTEND-01A1 §13/§19", () => {
  beforeEach(() => {
    vi.mocked(createSupplier).mockReset();
    vi.mocked(updateSupplier).mockReset();
    reload.mockReset();
    push.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    supplierState.supplier = undefined;
    supplierState.error = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("§13: edit-load error shows a retry button wired to reload()", async () => {
    supplierState.error = true;
    const user = userEvent.setup();
    render(<SupplierForm supplierId="s1" />);
    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("SF8: create uses the server-returned UUID", async () => {
    vi.mocked(createSupplier).mockResolvedValueOnce(supplier({ id: "server-generated-uuid" }));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<SupplierForm onSuccess={onSuccess} onCancel={() => {}} />);

    await user.type(screen.getByLabelText("Nome"), "Casa Silva");
    await user.click(screen.getByRole("button", { name: /salvar fornecedor/i }));

    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: "server-generated-uuid" }));
  });

  it("SF9: editing an existing Supplier calls updateSupplier (PUT), never createSupplier", async () => {
    supplierState.supplier = supplier({ id: "s1" });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    vi.mocked(updateSupplier).mockResolvedValueOnce(supplier({ id: "s1", name: "Casa Silva Ltda" }));
    render(<SupplierForm supplierId="s1" onSuccess={onSuccess} onCancel={() => {}} />);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    expect(updateSupplier).toHaveBeenCalledWith("s1", expect.any(Object));
    expect(createSupplier).not.toHaveBeenCalled();
  });

  it("SF16: a backend 422 validation error is shown inline", async () => {
    const user = userEvent.setup();
    vi.mocked(createSupplier).mockRejectedValueOnce(new ApiValidationError({ document: ["Documento inválido."] }, null));

    render(<SupplierForm onCancel={() => {}} />);
    await user.type(screen.getByLabelText("Nome"), "Casa Silva");
    await user.click(screen.getByRole("button", { name: /salvar fornecedor/i }));

    expect((await screen.findAllByText("Documento inválido.")).length).toBeGreaterThan(0);
  });

  it("SF17: a quick-create POST for Company A resolving after switching to B never fires onSuccess", async () => {
    let resolveCreate!: (value: Supplier) => void;
    vi.mocked(createSupplier).mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve; }));
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(<SupplierForm onSuccess={onSuccess} onCancel={() => {}} />);
    await user.type(screen.getByLabelText("Nome"), "Casa Silva");
    await user.click(screen.getByRole("button", { name: /salvar fornecedor/i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<SupplierForm onSuccess={onSuccess} onCancel={() => {}} />);

    resolveCreate(supplier());
    await new Promise((r) => setTimeout(r, 0));

    expect(onSuccess).not.toHaveBeenCalled();
  });
});
