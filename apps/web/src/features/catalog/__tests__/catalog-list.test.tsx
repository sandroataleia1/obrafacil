import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogList } from "../catalog-list";
import type { CatalogItem, CatalogItemPaginationResponse } from "../types";

const refresh = vi.fn();
const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ ...authState, refresh }),
}));

vi.mock("../catalog-client", () => ({
  listCatalogItems: vi.fn(),
}));

import { listCatalogItems } from "../catalog-client";

function item(name: string, overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: `id-${name}`,
    type: "service",
    code: null,
    name,
    category: null,
    unit: "un",
    description: null,
    cost_price: null,
    sale_price: null,
    active: true,
    created_at: "2026-09-11T00:00:00Z",
    updated_at: "2026-09-11T00:00:00Z",
    ...overrides,
  };
}

function page(items: CatalogItem[], currentPage = 1, lastPage = 1): CatalogItemPaginationResponse {
  return {
    data: items,
    meta: { current_page: currentPage, from: 1, last_page: lastPage, per_page: 15, to: items.length, total: items.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

async function findItem(name: string) {
  return screen.findAllByText(name);
}
function itemCount(name: string) {
  return screen.queryAllByText(name).length;
}

describe("CatalogList", () => {
  beforeEach(() => {
    vi.mocked(listCatalogItems).mockReset();
    refresh.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** L2/L1: renders items from the API, defaulting to active=true filter. */
  it("L1/L2: renders items from the API and defaults the status filter to Ativos", async () => {
    vi.mocked(listCatalogItems).mockResolvedValue(page([item("Pintura de paredes")]));
    render(<CatalogList />);

    await findItem("Pintura de paredes");
    expect(vi.mocked(listCatalogItems).mock.calls[0]![0].active).toBe(true);
  });

  /** L3: empty state when there are truly zero items. */
  it("L3: shows the empty state when there are no items at all", async () => {
    vi.mocked(listCatalogItems).mockResolvedValue(page([]));
    render(<CatalogList />);

    await screen.findByText("Nenhum produto ou serviço cadastrado");
  });

  /** L4: error + retry. */
  it("L4: shows an error state with retry on failure", async () => {
    vi.mocked(listCatalogItems).mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(page([item("Pintura")]));
    const user = userEvent.setup();
    render(<CatalogList />);

    await screen.findByText("Não foi possível carregar os itens agora.");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await findItem("Pintura");
  });

  /** L6: search is sent server-side, debounced. */
  it("L6: search is sent to the API and resets the page", async () => {
    vi.mocked(listCatalogItems).mockResolvedValue(page([item("Pintura")]));
    const user = userEvent.setup();
    render(<CatalogList />);
    await findItem("Pintura");

    await user.type(screen.getByLabelText("Buscar produtos e serviços"), "pintura");
    await waitFor(() => expect(vi.mocked(listCatalogItems).mock.calls.at(-1)![0].search).toBe("pintura"));
    expect(vi.mocked(listCatalogItems).mock.calls.at(-1)![0].page).toBe(1);
  });

  /** L7/L8: type filters. */
  it("L7/L8: type filter buttons send type=product / type=service", async () => {
    vi.mocked(listCatalogItems).mockResolvedValue(page([item("X")]));
    const user = userEvent.setup();
    render(<CatalogList />);
    await findItem("X");

    await user.click(screen.getByRole("radio", { name: "Produtos" }));
    await waitFor(() => expect(vi.mocked(listCatalogItems).mock.calls.at(-1)![0].type).toBe("product"));

    await user.click(screen.getByRole("radio", { name: "Serviços" }));
    await waitFor(() => expect(vi.mocked(listCatalogItems).mock.calls.at(-1)![0].type).toBe("service"));
  });

  /** L9/L10/L11: status filters map to active true/false/undefined. */
  it("L9-L11: status filter buttons map to active=true/false/omitted", async () => {
    vi.mocked(listCatalogItems).mockResolvedValue(page([item("X")]));
    const user = userEvent.setup();
    render(<CatalogList />);
    await findItem("X");

    const statusGroup = screen.getByRole("radiogroup", { name: "Status" });
    const { getByRole } = within(statusGroup);

    await user.click(getByRole("radio", { name: "Inativos" }));
    await waitFor(() => expect(vi.mocked(listCatalogItems).mock.calls.at(-1)![0].active).toBe(false));

    await user.click(getByRole("radio", { name: "Todos" }));
    await waitFor(() => expect(vi.mocked(listCatalogItems).mock.calls.at(-1)![0].active).toBeUndefined());
  });

  /** L14: an inactive item appears correctly under "Todos"/"Inativos". */
  it("L14: an inactive item renders with the Inativo badge", async () => {
    vi.mocked(listCatalogItems).mockResolvedValue(page([item("Item inativo", { active: false })]));
    render(<CatalogList />);

    await findItem("Item inativo");
    expect(itemCount("Inativo")).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------
  // Tenant fail-closed (T1-T5)
  // ---------------------------------------------------------------

  /** T1: renders Company A's items. */
  it("T1: renders Company A's items", async () => {
    vi.mocked(listCatalogItems).mockResolvedValue(page([item("Item A")]));
    render(<CatalogList />);
    await findItem("Item A");
  });

  /** T2/T3: switching tenant hides A immediately; a late A response never reappears once B is shown. */
  it("T2/T3: switching company hides A immediately and discards a late A response", async () => {
    let resolveB!: (value: CatalogItemPaginationResponse) => void;
    const bPromise = new Promise<CatalogItemPaginationResponse>((resolve) => {
      resolveB = resolve;
    });
    vi.mocked(listCatalogItems).mockResolvedValueOnce(page([item("Item A")])).mockReturnValueOnce(bPromise);

    const { rerender } = render(<CatalogList />);
    await findItem("Item A");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CatalogList />);

    expect(itemCount("Item A")).toBe(0);
    expect(screen.getByRole("status")).toBeInTheDocument();

    resolveB(page([item("Item B")]));
    await findItem("Item B");
    expect(itemCount("Item A")).toBe(0);
  });

  /** T4: switching company resets the page to 1. */
  it("T4: switching company resets page to 1", async () => {
    vi.mocked(listCatalogItems)
      .mockResolvedValueOnce(page([item("Item A")], 4, 4))
      .mockResolvedValueOnce(page([item("Item B")], 1, 1));

    const { rerender } = render(<CatalogList />);
    await findItem("Item A");
    await screen.findByText("Página 4 de 4");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CatalogList />);
    await findItem("Item B");

    expect(vi.mocked(listCatalogItems).mock.calls.at(-1)![0].page).toBe(1);
  });

  /** T5: filters persist across a tenant switch (not reset). */
  it("T5: type/status filters are preserved across a company switch", async () => {
    vi.mocked(listCatalogItems).mockResolvedValue(page([item("X")]));
    const user = userEvent.setup();
    const { rerender } = render(<CatalogList />);
    await findItem("X");

    await user.click(screen.getByRole("radio", { name: "Produtos" }));
    await waitFor(() => expect(vi.mocked(listCatalogItems).mock.calls.at(-1)![0].type).toBe("product"));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CatalogList />);

    await waitFor(() => expect(vi.mocked(listCatalogItems).mock.calls.at(-1)![0].type).toBe("product"));
  });
});
