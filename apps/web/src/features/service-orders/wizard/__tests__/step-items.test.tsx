import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// `QuickCatalogDialog` (rendered unconditionally, just closed via `open`)
// uses `ResponsiveDialog`, which reads `window.matchMedia` through
// `useMediaQuery` even while closed — same mock other dialog-adjacent
// test files in this codebase already use (e.g. quick-catalog-dialog.test.tsx).
vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
);

vi.mock("@/features/catalog/catalog-client", () => ({
  listCatalogItems: vi.fn(),
  createCatalogItem: vi.fn(),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ activeCompany: { id: "company-a", name: "Empresa A" } }),
}));

import { createCatalogItem, listCatalogItems } from "@/features/catalog/catalog-client";
import type { CatalogItem, CatalogItemPaginationResponse } from "@/features/catalog/types";
import { StepItems } from "../step-items";
import type { DraftItem } from "../wizard-types";

function catalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "item-1",
    type: "service",
    code: "PINT-01",
    name: "Pintura de parede",
    category: null,
    unit: "m²",
    description: null,
    cost_price: null,
    sale_price: "150.00",
    active: true,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function page(items: CatalogItem[]): CatalogItemPaginationResponse {
  return {
    data: items,
    meta: { current_page: 1, from: 1, last_page: 1, per_page: 15, to: items.length, total: items.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

const isStaleRequestAlwaysFresh = () => false;

function deferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderStepItems(overrides: Partial<Parameters<typeof StepItems>[0]> = {}) {
  return render(
    <StepItems
      items={[]}
      onAdd={vi.fn()}
      onUpdate={vi.fn()}
      onRemove={vi.fn()}
      requestCompanyId="company-a"
      isStaleRequest={isStaleRequestAlwaysFresh}
      {...overrides}
    />
  );
}

describe("StepItems — catalog autocomplete gating", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("CI1: 0/1/2 trimmed characters fire zero API calls", async () => {
    const user = userEvent.setup();
    renderStepItems();

    await user.type(screen.getByLabelText("Buscar produto ou serviço"), "pi");
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(listCatalogItems).not.toHaveBeenCalled();
    expect(screen.getByText(/digite pelo menos 3 caracteres/i)).toBeInTheDocument();
  });

  it("CI2: 3+ characters fire the search with active=true", async () => {
    vi.mocked(listCatalogItems).mockResolvedValue(page([catalogItem()]));
    const user = userEvent.setup();
    renderStepItems();

    await user.type(screen.getByLabelText("Buscar produto ou serviço"), "pin");
    await waitFor(() => expect(listCatalogItems).toHaveBeenCalledWith(expect.objectContaining({ search: "pin", active: true })));
    await screen.findByText("Pintura de parede");
  });

  it("CI3: a too-short query never shows 'Nenhum item encontrado'", async () => {
    const user = userEvent.setup();
    renderStepItems();

    await user.type(screen.getByLabelText("Buscar produto ou serviço"), "pi");
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(screen.queryByText(/nenhum item encontrado/i)).not.toBeInTheDocument();
  });

  it("CI4: the type filter is preserved across a search", async () => {
    vi.mocked(listCatalogItems).mockResolvedValue(page([catalogItem()]));
    const user = userEvent.setup();
    renderStepItems();

    await user.click(screen.getByRole("button", { name: "Produtos" }));
    await user.type(screen.getByLabelText("Buscar produto ou serviço"), "pin");

    await waitFor(() => expect(listCatalogItems).toHaveBeenCalledWith(expect.objectContaining({ type: "product" })));
  });

  it("CI5: clicking 'Adicionar' clears the search UI while the added item stays visible in 'Itens adicionados'", async () => {
    vi.mocked(listCatalogItems).mockResolvedValue(page([catalogItem()]));
    const items: DraftItem[] = [];
    const onAdd = vi.fn((item: DraftItem) => items.push(item));
    const user = userEvent.setup();
    const { rerender } = renderStepItems({ onAdd });

    await user.type(screen.getByLabelText("Buscar produto ou serviço"), "pin");
    await screen.findByText("Pintura de parede");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(onAdd).toHaveBeenCalled();
    rerender(
      <StepItems items={items} onAdd={onAdd} onUpdate={vi.fn()} onRemove={vi.fn()} requestCompanyId="company-a" isStaleRequest={isStaleRequestAlwaysFresh} />
    );

    expect(screen.getByLabelText("Buscar produto ou serviço")).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getAllByText("Pintura de parede").length).toBeGreaterThan(0);
  });

  it("CI6: Enter adds the top result and clears the search UI identically to a click", async () => {
    vi.mocked(listCatalogItems).mockResolvedValue(page([catalogItem()]));
    const onAdd = vi.fn();
    const user = userEvent.setup();
    renderStepItems({ onAdd });

    const input = screen.getByLabelText("Buscar produto ou serviço");
    await user.type(input, "pin");
    await screen.findByText("Pintura de parede");
    await user.keyboard("{Enter}");

    expect(onAdd).toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("CI7: active=true is always sent regardless of the type filter", async () => {
    vi.mocked(listCatalogItems).mockResolvedValue(page([]));
    const user = userEvent.setup();
    renderStepItems();

    await user.type(screen.getByLabelText("Buscar produto ou serviço"), "pin");
    await waitFor(() => expect(listCatalogItems).toHaveBeenCalledWith(expect.objectContaining({ active: true })));
  });

  it("CI8: the Quick Service flow clears the search UI after adding", async () => {
    vi.mocked(createCatalogItem).mockResolvedValue(catalogItem({ id: "item-2", name: "Serviço Rápido" }));
    const onAdd = vi.fn();
    const user = userEvent.setup();
    renderStepItems({ onAdd });

    // Type a partial search first so there's search UI state to clear.
    await user.type(screen.getByLabelText("Buscar produto ou serviço"), "xy");

    await user.click(screen.getByRole("button", { name: /novo serviço/i }));
    await user.type(screen.getByLabelText("Nome"), "Serviço Rápido");
    await user.type(screen.getByLabelText("Unidade"), "un");
    await user.click(screen.getByRole("button", { name: /salvar e adicionar/i }));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(screen.getByLabelText("Buscar produto ou serviço")).toHaveValue("");
  });

  it("CI8b: the Quick Product flow also clears the search UI after adding", async () => {
    vi.mocked(createCatalogItem).mockResolvedValue(catalogItem({ id: "item-3", type: "product", name: "Produto Rápido" }));
    const onAdd = vi.fn();
    const user = userEvent.setup();
    renderStepItems({ onAdd });

    await user.type(screen.getByLabelText("Buscar produto ou serviço"), "xy");

    await user.click(screen.getByRole("button", { name: /novo produto/i }));
    await user.type(screen.getByLabelText("Nome"), "Produto Rápido");
    await user.type(screen.getByLabelText("Unidade"), "un");
    await user.click(screen.getByRole("button", { name: /salvar e adicionar/i }));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(screen.getByLabelText("Buscar produto ou serviço")).toHaveValue("");
  });

  it("CI9: a late catalog search response for a stale tenant is discarded", async () => {
    let resolveSearch!: (value: CatalogItemPaginationResponse) => void;
    vi.mocked(listCatalogItems).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSearch = resolve;
      })
    );
    const activeCompanyIdRef = { current: "company-a" as string | undefined };
    const isStaleRequest = (requestCompanyId: string | undefined) => activeCompanyIdRef.current !== requestCompanyId;
    const user = userEvent.setup();
    const { rerender } = render(
      <StepItems items={[]} onAdd={vi.fn()} onUpdate={vi.fn()} onRemove={vi.fn()} requestCompanyId="company-a" isStaleRequest={isStaleRequest} />
    );

    await user.type(screen.getByLabelText("Buscar produto ou serviço"), "pin");
    await waitFor(() => expect(listCatalogItems).toHaveBeenCalled());

    activeCompanyIdRef.current = "company-b";
    rerender(
      <StepItems items={[]} onAdd={vi.fn()} onUpdate={vi.fn()} onRemove={vi.fn()} requestCompanyId="company-b" isStaleRequest={isStaleRequest} />
    );

    resolveSearch(page([catalogItem({ name: "Pintura da Empresa A" })]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Pintura da Empresa A")).not.toBeInTheDocument();
  });

  it("CI10: a stale in-flight response can't repopulate results after the query drops back below 3 characters", async () => {
    const deferred = deferredPromise<CatalogItemPaginationResponse>();
    vi.mocked(listCatalogItems).mockReturnValueOnce(deferred.promise);
    const user = userEvent.setup();
    renderStepItems();

    const input = screen.getByLabelText("Buscar produto ou serviço");
    await user.type(input, "pin");
    await waitFor(() => expect(listCatalogItems).toHaveBeenCalled());

    await user.type(input, "{Backspace}{Backspace}");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.getByText(/digite pelo menos 3 caracteres/i)).toBeInTheDocument();

    deferred.resolve(page([catalogItem()]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Pintura de parede")).not.toBeInTheDocument();
    expect(screen.getByText(/digite pelo menos 3 caracteres/i)).toBeInTheDocument();
  });

  it("CI11: a stale in-flight response can't repopulate results after Escape clears the search", async () => {
    const deferred = deferredPromise<CatalogItemPaginationResponse>();
    vi.mocked(listCatalogItems).mockReturnValueOnce(deferred.promise);
    const user = userEvent.setup();
    renderStepItems();

    const input = screen.getByLabelText("Buscar produto ou serviço");
    await user.type(input, "pin");
    await waitFor(() => expect(listCatalogItems).toHaveBeenCalled());

    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");

    deferred.resolve(page([catalogItem()]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Pintura de parede")).not.toBeInTheDocument();
  });

  it("CI12: adding an item from a later, resolved search discards an earlier still-in-flight search's response", async () => {
    const deferred = deferredPromise<CatalogItemPaginationResponse>();
    vi.mocked(listCatalogItems).mockReturnValueOnce(deferred.promise);
    const onAdd = vi.fn();
    const user = userEvent.setup();
    renderStepItems({ onAdd });

    const input = screen.getByLabelText("Buscar produto ou serviço");
    await user.type(input, "pin");
    await waitFor(() => expect(listCatalogItems).toHaveBeenCalledTimes(1));

    vi.mocked(listCatalogItems).mockResolvedValueOnce(page([catalogItem({ id: "item-2", name: "Reparo elétrico" })]));
    await user.clear(input);
    await user.type(input, "rep");
    await screen.findByText("Reparo elétrico");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(onAdd).toHaveBeenCalled();
    expect(input).toHaveValue("");

    deferred.resolve(page([catalogItem()]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Pintura de parede")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("CI13: adding an item via Enter from a later, resolved search discards an earlier still-in-flight search's response", async () => {
    const deferred = deferredPromise<CatalogItemPaginationResponse>();
    vi.mocked(listCatalogItems).mockReturnValueOnce(deferred.promise);
    const onAdd = vi.fn();
    const user = userEvent.setup();
    renderStepItems({ onAdd });

    const input = screen.getByLabelText("Buscar produto ou serviço");
    await user.type(input, "pin");
    await waitFor(() => expect(listCatalogItems).toHaveBeenCalledTimes(1));

    vi.mocked(listCatalogItems).mockResolvedValueOnce(page([catalogItem({ id: "item-2", name: "Reparo elétrico" })]));
    await user.clear(input);
    await user.type(input, "rep");
    await screen.findByText("Reparo elétrico");
    await user.keyboard("{Enter}");

    expect(onAdd).toHaveBeenCalled();
    expect(input).toHaveValue("");

    deferred.resolve(page([catalogItem()]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Pintura de parede")).not.toBeInTheDocument();
  });

  it("CI14: adding an item via Quick Product creation discards an earlier still-in-flight search's response", async () => {
    const deferred = deferredPromise<CatalogItemPaginationResponse>();
    vi.mocked(listCatalogItems).mockReturnValueOnce(deferred.promise);
    vi.mocked(createCatalogItem).mockResolvedValue(catalogItem({ id: "item-3", type: "product", name: "Produto Rápido" }));
    const onAdd = vi.fn();
    const user = userEvent.setup();
    renderStepItems({ onAdd });

    const input = screen.getByLabelText("Buscar produto ou serviço");
    await user.type(input, "pin");
    await waitFor(() => expect(listCatalogItems).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /novo produto/i }));
    await user.type(screen.getByLabelText("Nome"), "Produto Rápido");
    await user.type(screen.getByLabelText("Unidade"), "un");
    await user.click(screen.getByRole("button", { name: /salvar e adicionar/i }));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(input).toHaveValue("");

    deferred.resolve(page([catalogItem()]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Pintura de parede")).not.toBeInTheDocument();
  });

  it("CI15: adding an item via Quick Service creation discards an earlier still-in-flight search's response", async () => {
    const deferred = deferredPromise<CatalogItemPaginationResponse>();
    vi.mocked(listCatalogItems).mockReturnValueOnce(deferred.promise);
    vi.mocked(createCatalogItem).mockResolvedValue(catalogItem({ id: "item-2", name: "Serviço Rápido" }));
    const onAdd = vi.fn();
    const user = userEvent.setup();
    renderStepItems({ onAdd });

    const input = screen.getByLabelText("Buscar produto ou serviço");
    await user.type(input, "pin");
    await waitFor(() => expect(listCatalogItems).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /novo serviço/i }));
    await user.type(screen.getByLabelText("Nome"), "Serviço Rápido");
    await user.type(screen.getByLabelText("Unidade"), "un");
    await user.click(screen.getByRole("button", { name: /salvar e adicionar/i }));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(input).toHaveValue("");

    deferred.resolve(page([catalogItem()]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Pintura de parede")).not.toBeInTheDocument();
  });

  it("CI16: switching the type filter fires a newer search whose response wins over an older in-flight one, regardless of settle order", async () => {
    const deferredAll = deferredPromise<CatalogItemPaginationResponse>();
    const deferredProducts = deferredPromise<CatalogItemPaginationResponse>();
    vi.mocked(listCatalogItems).mockReturnValueOnce(deferredAll.promise).mockReturnValueOnce(deferredProducts.promise);
    const user = userEvent.setup();
    renderStepItems();

    await user.type(screen.getByLabelText("Buscar produto ou serviço"), "pin");
    await waitFor(() => expect(listCatalogItems).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Produtos" }));
    await waitFor(() => expect(listCatalogItems).toHaveBeenCalledTimes(2));

    // R2 (the newer, "Produtos" filter) resolves FIRST.
    deferredProducts.resolve(page([catalogItem({ id: "item-2", type: "product", name: "Tinta acrílica" })]));
    await screen.findByText("Tinta acrílica");

    // R1 (the older, "Todos" filter) resolves AFTER — it must not win.
    deferredAll.resolve(page([catalogItem({ name: "Pintura de parede" })]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText("Tinta acrílica")).toBeInTheDocument();
    expect(screen.queryByText("Pintura de parede")).not.toBeInTheDocument();
  });

  it("CI17: changing the type filter while the query is under 3 characters fires zero API calls", async () => {
    const user = userEvent.setup();
    renderStepItems();

    await user.type(screen.getByLabelText("Buscar produto ou serviço"), "pi");
    await user.click(screen.getByRole("button", { name: "Produtos" }));
    await user.click(screen.getByRole("button", { name: "Serviços" }));
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(listCatalogItems).not.toHaveBeenCalled();
  });
});
