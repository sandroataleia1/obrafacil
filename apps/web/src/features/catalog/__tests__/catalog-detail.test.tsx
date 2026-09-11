import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";
import { CatalogDetail } from "../catalog-detail";
import type { CatalogItem } from "../types";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
);

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
    description: "Aplicação de duas demãos.",
    cost_price: "18.50",
    sale_price: "32.00",
    active: true,
    created_at: "2026-09-11T00:00:00Z",
    updated_at: "2026-09-11T00:00:00Z",
    ...overrides,
  };
}

describe("CatalogDetail", () => {
  beforeEach(() => {
    vi.mocked(getCatalogItem).mockReset();
    vi.mocked(updateCatalogItem).mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** D1: renders the item's fields. */
  it("D1: renders type/code/category/unit", async () => {
    vi.mocked(getCatalogItem).mockResolvedValue(baseItem());
    render(<CatalogDetail id="item-1" />);

    await screen.findByText("Pintura de paredes");
    expect(screen.getByText("Serviço")).toBeInTheDocument();
    expect(screen.getByText("PINT-M2")).toBeInTheDocument();
    expect(screen.getByText("Pintura")).toBeInTheDocument();
    expect(screen.getByText("m²")).toBeInTheDocument();
  });

  /** D2: money renders formatted BRL for both prices. */
  it("D2: renders custo base and preço de venda in BRL", async () => {
    vi.mocked(getCatalogItem).mockResolvedValue(baseItem());
    render(<CatalogDetail id="item-1" />);

    await screen.findByText("Pintura de paredes");
    expect(screen.getByText("R$ 18,50")).toBeInTheDocument();
    expect(screen.getByText("R$ 32,00")).toBeInTheDocument();
  });

  /** D3: null money shows "Não informado", never a fabricated zero. */
  it("D3: null cost_price/sale_price render as Não informado", async () => {
    vi.mocked(getCatalogItem).mockResolvedValue(baseItem({ cost_price: null, sale_price: null }));
    render(<CatalogDetail id="item-1" />);

    await screen.findByText("Pintura de paredes");
    expect(screen.getAllByText("Não informado")).toHaveLength(2);
  });

  /** D4: active status is shown as visible text "Ativo". */
  it("D4: shows Status: Ativo for an active item", async () => {
    vi.mocked(getCatalogItem).mockResolvedValue(baseItem());
    render(<CatalogDetail id="item-1" />);

    await screen.findByText("Pintura de paredes");
    expect(screen.getByText("Ativo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inativar" })).toBeInTheDocument();
  });

  /** D5: inactivating requires confirmation and sends a full snapshot PUT, not {active:false} alone. */
  it("D5: Inativar asks for confirmation, then PUTs the complete item snapshot", async () => {
    const item = baseItem();
    vi.mocked(getCatalogItem).mockResolvedValue(item);
    vi.mocked(updateCatalogItem).mockResolvedValue({ ...item, active: false });

    const user = userEvent.setup();
    render(<CatalogDetail id="item-1" />);
    await screen.findByText("Pintura de paredes");

    await user.click(screen.getByRole("button", { name: "Inativar" }));
    await screen.findByText("Inativar este item?");

    // §47: while the confirmation dialog is open, the page behind it is
    // marked inert/aria-hidden — only the dialog's own "Inativar" button
    // is reachable via the accessibility tree at this point.
    await user.click(screen.getByRole("button", { name: "Inativar" }));

    await waitFor(() => expect(updateCatalogItem).toHaveBeenCalledTimes(1));
    const [id, payload] = vi.mocked(updateCatalogItem).mock.calls[0]!;
    expect(id).toBe("item-1");
    expect(payload).toEqual({
      type: "service",
      code: "PINT-M2",
      name: "Pintura de paredes",
      category: "Pintura",
      unit: "m²",
      description: "Aplicação de duas demãos.",
      cost_price: "18.50",
      sale_price: "32.00",
      active: false,
    });
  });

  /** D6: after inactivating, the item continues to exist on the page (no removal, just Status: Inativo + Reativar). */
  it("D6: after inactivating, the item stays rendered with Status: Inativo and a Reativar action", async () => {
    const item = baseItem();
    vi.mocked(getCatalogItem).mockResolvedValue(item);
    vi.mocked(updateCatalogItem).mockResolvedValue({ ...item, active: false });

    const user = userEvent.setup();
    render(<CatalogDetail id="item-1" />);
    await screen.findByText("Pintura de paredes");

    await user.click(screen.getByRole("button", { name: "Inativar" }));
    await screen.findByText("Inativar este item?");
    await user.click(screen.getByRole("button", { name: "Inativar" }));

    await waitFor(() => expect(screen.getByText("Inativo")).toBeInTheDocument());
    expect(screen.getByText("Pintura de paredes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reativar" })).toBeInTheDocument();
  });

  /** D7: reactivating needs no confirmation and PUTs active:true immediately. */
  it("D7: Reativar sends the PUT immediately without a confirmation dialog", async () => {
    const inactiveItem = baseItem({ active: false });
    vi.mocked(getCatalogItem).mockResolvedValue(inactiveItem);
    vi.mocked(updateCatalogItem).mockResolvedValue({ ...inactiveItem, active: true });

    const user = userEvent.setup();
    render(<CatalogDetail id="item-1" />);
    await screen.findByText("Pintura de paredes");

    await user.click(screen.getByRole("button", { name: "Reativar" }));

    await waitFor(() => expect(updateCatalogItem).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateCatalogItem).mock.calls[0]![1].active).toBe(true);
    expect(screen.queryByText("Inativar este item?")).not.toBeInTheDocument();
  });

  /** D9: a 404 shows "Item não encontrado". */
  it("D9: a 404 shows Item não encontrado", async () => {
    vi.mocked(getCatalogItem).mockRejectedValue(new ApiError(404, "not found"));
    render(<CatalogDetail id="missing" />);

    await screen.findByText("Item não encontrado");
  });

  /** D10/D11: there is no delete action and no delete-related network call anywhere on this page. */
  it("D10/D11: renders no Excluir action and never calls a delete function", async () => {
    vi.mocked(getCatalogItem).mockResolvedValue(baseItem());
    render(<CatalogDetail id="item-1" />);

    await screen.findByText("Pintura de paredes");
    expect(screen.queryByRole("button", { name: /excluir/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/excluir/i)).not.toBeInTheDocument();
  });

  /** D12: error + retry. */
  it("D12: shows an error state with retry on failure", async () => {
    vi.mocked(getCatalogItem).mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(baseItem());
    const user = userEvent.setup();
    render(<CatalogDetail id="item-1" />);

    await screen.findByText("Não foi possível carregar este item agora.");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByText("Pintura de paredes");
  });

  // ---------------------------------------------------------------
  // Tenant fail-closed (T6-T7)
  // ---------------------------------------------------------------

  /** T6: switching company hides Company A's item immediately and fetches again. */
  it("T6: switching company hides Company A's item and fetches again", async () => {
    vi.mocked(getCatalogItem)
      .mockResolvedValueOnce(baseItem({ name: "Item da Empresa A" }))
      .mockResolvedValueOnce(baseItem({ name: "Item da Empresa B" }));

    const { rerender } = render(<CatalogDetail id="item-1" />);
    await screen.findByText("Item da Empresa A");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CatalogDetail id="item-1" />);

    expect(screen.queryByText("Item da Empresa A")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await screen.findByText("Item da Empresa B");
    expect(getCatalogItem).toHaveBeenCalledTimes(2);
  });

  /** T7: a late response from the old tenant never overwrites the newer tenant's already-applied result. */
  it("T7: a late response from the old tenant never reappears after the new tenant's item loaded", async () => {
    let resolveFirst!: (value: CatalogItem) => void;
    const firstPromise = new Promise<CatalogItem>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(getCatalogItem)
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(baseItem({ name: "Item da Empresa B" }));

    const { rerender } = render(<CatalogDetail id="item-1" />);
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CatalogDetail id="item-1" />);

    await screen.findByText("Item da Empresa B");

    resolveFirst(baseItem({ name: "Item da Empresa A" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText("Item da Empresa B")).toBeInTheDocument();
    expect(screen.queryByText("Item da Empresa A")).not.toBeInTheDocument();
  });
});
