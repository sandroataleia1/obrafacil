import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";
import { CatalogEditForm } from "../catalog-edit-form";
import type { CatalogItem } from "../types";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../catalog-client", () => ({
  getCatalogItem: vi.fn(),
  updateCatalogItem: vi.fn(),
}));

import { getCatalogItem, updateCatalogItem } from "../catalog-client";

function baseItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "item-1",
    type: "service",
    code: "PINT-M2",
    name: "Pintura de paredes",
    category: "Pintura",
    unit: "m²",
    description: null,
    cost_price: "18.50",
    sale_price: "32.00",
    active: true,
    created_at: "2026-09-11T00:00:00Z",
    updated_at: "2026-09-11T00:00:00Z",
    ...overrides,
  };
}

describe("CatalogEditForm", () => {
  beforeEach(() => {
    vi.mocked(getCatalogItem).mockReset();
    vi.mocked(updateCatalogItem).mockReset();
    push.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** Fields load pre-filled from the API, prices displayed in BRL for editing. */
  it("loads and pre-fills the fields from the API, with prices shown in BRL", async () => {
    vi.mocked(getCatalogItem).mockResolvedValue(baseItem());
    render(<CatalogEditForm catalogItemId="item-1" />);

    await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue("Pintura de paredes"));
    expect(screen.getByLabelText("Unidade")).toHaveValue("m²");
    expect(screen.getByLabelText("Custo base")).toHaveValue("18,50");
    expect(screen.getByLabelText("Preço de venda")).toHaveValue("32,00");
  });

  /** Saving PUTs a full snapshot with money re-normalized as decimal strings. */
  it("saves the full snapshot with money normalized back to decimal strings", async () => {
    vi.mocked(getCatalogItem).mockResolvedValue(baseItem());
    vi.mocked(updateCatalogItem).mockResolvedValue(baseItem());

    const user = userEvent.setup();
    render(<CatalogEditForm catalogItemId="item-1" />);
    await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue("Pintura de paredes"));

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateCatalogItem).toHaveBeenCalledTimes(1));
    const [id, payload] = vi.mocked(updateCatalogItem).mock.calls[0]!;
    expect(id).toBe("item-1");
    expect(payload.cost_price).toBe("18.50");
    expect(payload.sale_price).toBe("32.00");
    expect(payload.active).toBe(true);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/catalogo/item-1"));
  });

  /** Toggling "Disponível para uso" off and saving sends active:false. */
  it("toggling the availability switch off saves active:false", async () => {
    vi.mocked(getCatalogItem).mockResolvedValue(baseItem());
    vi.mocked(updateCatalogItem).mockResolvedValue(baseItem({ active: false }));

    const user = userEvent.setup();
    render(<CatalogEditForm catalogItemId="item-1" />);
    await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue("Pintura de paredes"));

    await user.click(screen.getByRole("switch", { name: "Disponível para uso" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateCatalogItem).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateCatalogItem).mock.calls[0]![1].active).toBe(false);
  });

  /** A 404 shows "Item não encontrado". */
  it("a 404 shows Item não encontrado", async () => {
    vi.mocked(getCatalogItem).mockRejectedValue(new ApiError(404, "not found"));
    render(<CatalogEditForm catalogItemId="missing" />);

    await screen.findByText("Item não encontrado");
  });

  // ---------------------------------------------------------------
  // Tenant fail-closed (T8-T10)
  // ---------------------------------------------------------------

  /** T8: switching company discards Company A's form and refetches. */
  it("T8: switching company discards the previous tenant's form and refetches", async () => {
    vi.mocked(getCatalogItem)
      .mockResolvedValueOnce(baseItem({ name: "Item da Empresa A" }))
      .mockResolvedValueOnce(baseItem({ name: "Item da Empresa B" }));

    const { rerender } = render(<CatalogEditForm catalogItemId="item-1" />);
    await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue("Item da Empresa A"));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CatalogEditForm catalogItemId="item-1" />);

    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue("Item da Empresa B"));
    expect(getCatalogItem).toHaveBeenCalledTimes(2);
  });

  /** T9: a late response from the old tenant never overwrites the new tenant's already-applied form. */
  it("T9: a late-arriving response from the old tenant never overwrites the new tenant's form", async () => {
    let resolveFirst!: (value: CatalogItem) => void;
    const firstPromise = new Promise<CatalogItem>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(getCatalogItem)
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(baseItem({ name: "Item da Empresa B" }));

    const { rerender } = render(<CatalogEditForm catalogItemId="item-1" />);
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CatalogEditForm catalogItemId="item-1" />);

    await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue("Item da Empresa B"));

    resolveFirst(baseItem({ name: "Item da Empresa A" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByLabelText("Nome")).toHaveValue("Item da Empresa B");
  });

  /** T10: no global cache — a fresh mount for a different company id issues its own GET, never reusing A's data. */
  it("T10: no data is reused across tenants without ownership — a fresh request is always issued", async () => {
    vi.mocked(getCatalogItem).mockResolvedValue(baseItem({ name: "Item da Empresa A" }));
    const { unmount } = render(<CatalogEditForm catalogItemId="item-1" />);
    await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue("Item da Empresa A"));
    unmount();

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    vi.mocked(getCatalogItem).mockResolvedValue(baseItem({ name: "Item da Empresa B" }));
    render(<CatalogEditForm catalogItemId="item-1" />);

    await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue("Item da Empresa B"));
    expect(getCatalogItem).toHaveBeenCalledTimes(2);
  });
});
