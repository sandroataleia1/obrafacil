import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
);

import { ApiError, ApiNetworkError } from "@/lib/api-client";
import { SupplierList } from "../supplier-list";
import type { SupplierListItem, SupplierPaginationResponse } from "../types";

const refresh = vi.fn();
const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ ...authState, refresh }),
}));

vi.mock("../suppliers-client", () => ({
  listSuppliers: vi.fn(),
  deleteSupplier: vi.fn(),
}));

import { deleteSupplier, listSuppliers } from "../suppliers-client";

function item(id: string, name: string): SupplierListItem {
  return { id, name, document: null, contact_name: null, phone: null, active: true, updated_at: "2026-09-10T00:00:00Z" };
}

function page(items: SupplierListItem[]): SupplierPaginationResponse {
  return {
    data: items,
    meta: { current_page: 1, from: 1, last_page: 1, per_page: 15, to: items.length, total: items.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

/**
 * SUPPLY-FRONTEND-01A1 §5-8. SupplierList mirrors MaterialList's
 * delete-dialog tenant-race proofs exactly — same instance kept mounted
 * across the switch via `rerender`, matching production behavior.
 */
describe("SupplierList delete tenant ownership — SUPPLY-FRONTEND-01A1 §5-8", () => {
  beforeEach(() => {
    vi.mocked(listSuppliers).mockReset().mockResolvedValue(page([]));
    vi.mocked(deleteSupplier).mockReset();
    refresh.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("§6: a late DELETE error for Company A never shows its dialog/error after switching to B", async () => {
    const user = userEvent.setup();
    vi.mocked(listSuppliers).mockResolvedValueOnce(page([item("s1", "Fornecedor A")]));
    let rejectDelete!: (error: unknown) => void;
    vi.mocked(deleteSupplier).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectDelete = reject; }));

    const { rerender } = render(<SupplierList />);
    await screen.findAllByText("Fornecedor A");

    await user.click(screen.getAllByRole("button", { name: /excluir fornecedor a/i })[0]);
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    vi.mocked(listSuppliers).mockResolvedValue(page([item("s2", "Fornecedor B")]));
    rerender(<SupplierList />);
    await screen.findAllByText("Fornecedor B");

    rejectDelete(new ApiNetworkError());

    await waitFor(() => {
      expect(screen.queryByText(/não foi possível excluir agora/i)).not.toBeInTheDocument();
    });
  });

  it("§20: a stale DELETE 404 for a Company no longer active triggers zero UI reconciliation", async () => {
    const user = userEvent.setup();
    vi.mocked(listSuppliers).mockResolvedValueOnce(page([item("s1", "Fornecedor A")]));
    let rejectDelete!: (error: unknown) => void;
    vi.mocked(deleteSupplier).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectDelete = reject; }));

    const { rerender } = render(<SupplierList />);
    await screen.findAllByText("Fornecedor A");
    await user.click(screen.getAllByRole("button", { name: /excluir fornecedor a/i })[0]);
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    vi.mocked(listSuppliers).mockResolvedValue(page([item("s2", "Fornecedor B")]));
    rerender(<SupplierList />);
    await screen.findAllByText("Fornecedor B");
    const callsBeforeReject = vi.mocked(listSuppliers).mock.calls.length;

    rejectDelete(new ApiError(404, "Not Found"));
    await new Promise((r) => setTimeout(r, 0));

    expect(vi.mocked(listSuppliers).mock.calls.length).toBe(callsBeforeReject);
  });
});
