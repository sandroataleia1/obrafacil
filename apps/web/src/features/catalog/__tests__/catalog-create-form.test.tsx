import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogCreateForm } from "../catalog-create-form";
import type { CatalogItem } from "../types";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("../catalog-client", () => ({
  createCatalogItem: vi.fn(),
}));

import { createCatalogItem } from "../catalog-client";

const CREATED_ITEM: CatalogItem = {
  id: "new-id",
  type: "service",
  code: null,
  name: "X",
  category: null,
  unit: "un",
  description: null,
  cost_price: null,
  sale_price: null,
  active: true,
  created_at: "2026-09-11T00:00:00Z",
  updated_at: "2026-09-11T00:00:00Z",
};

describe("CatalogCreateForm", () => {
  beforeEach(() => {
    vi.mocked(createCatalogItem).mockReset().mockResolvedValue(CREATED_ITEM);
    push.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** F1: service is the default type. */
  it("F1: defaults to Serviço", () => {
    render(<CatalogCreateForm />);
    expect(screen.getByRole("button", { name: "Serviço" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Produto" })).toHaveAttribute("aria-pressed", "false");
  });

  /** F2: switching between product/service. */
  it("F2: switches between Produto and Serviço", async () => {
    const user = userEvent.setup();
    render(<CatalogCreateForm />);

    await user.click(screen.getByRole("button", { name: "Produto" }));
    expect(screen.getByRole("button", { name: "Produto" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Serviço" })).toHaveAttribute("aria-pressed", "false");
  });

  /** F3: name required — submit stays disabled without it. */
  it("F3: submit is disabled without a name", () => {
    render(<CatalogCreateForm />);
    expect(screen.getByRole("button", { name: "Criar item" })).toBeDisabled();
  });

  /** F4: unit required — submit stays disabled without it. */
  it("F4: submit is disabled without a unit even with a name", async () => {
    const user = userEvent.setup();
    render(<CatalogCreateForm />);

    await user.type(screen.getByLabelText("Nome"), "Pintura de paredes");
    expect(screen.getByRole("button", { name: "Criar item" })).toBeDisabled();

    await user.type(screen.getByLabelText("Unidade"), "m²");
    expect(screen.getByRole("button", { name: "Criar item" })).toBeEnabled();
  });

  /** F5/F6/F7: code/category/description are optional — submit works without them. */
  it("F5-F7: code, category, and description are optional", async () => {
    const user = userEvent.setup();
    render(<CatalogCreateForm />);

    await user.type(screen.getByLabelText("Nome"), "Pintura de paredes");
    await user.type(screen.getByLabelText("Unidade"), "m²");
    await user.click(screen.getByRole("button", { name: "Criar item" }));

    await waitFor(() => expect(createCatalogItem).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createCatalogItem).mock.calls[0]![0];
    expect(payload.code).toBeNull();
    expect(payload.category).toBeNull();
    expect(payload.description).toBeNull();
  });

  /** F8/F9: cost/sale prices are nullable. */
  it("F8/F9: cost_price/sale_price are null when left blank", async () => {
    const user = userEvent.setup();
    render(<CatalogCreateForm />);

    await user.type(screen.getByLabelText("Nome"), "Pintura de paredes");
    await user.type(screen.getByLabelText("Unidade"), "m²");
    await user.click(screen.getByRole("button", { name: "Criar item" }));

    await waitFor(() => expect(createCatalogItem).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createCatalogItem).mock.calls[0]![0];
    expect(payload.cost_price).toBeNull();
    expect(payload.sale_price).toBeNull();
  });

  /** F10: sale < cost is allowed — no client-side blocking. */
  it("F10: sale price below cost price is allowed", async () => {
    const user = userEvent.setup();
    render(<CatalogCreateForm />);

    await user.type(screen.getByLabelText("Nome"), "X");
    await user.type(screen.getByLabelText("Unidade"), "un");
    await user.type(screen.getByLabelText("Custo base"), "100,00");
    await user.type(screen.getByLabelText("Preço de venda"), "10,00");
    await user.click(screen.getByRole("button", { name: "Criar item" }));

    await waitFor(() => expect(createCatalogItem).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createCatalogItem).mock.calls[0]![0];
    expect(payload.cost_price).toBe("100.00");
    expect(payload.sale_price).toBe("10.00");
  });

  /** F11/F12: active defaults to true, can be turned off before submit. */
  it("F11/F12: active defaults true, can be submitted as false", async () => {
    const user = userEvent.setup();
    render(<CatalogCreateForm />);

    await user.type(screen.getByLabelText("Nome"), "X");
    await user.type(screen.getByLabelText("Unidade"), "un");
    expect(screen.getByRole("switch", { name: "Disponível para uso" })).toHaveAttribute("data-checked");

    await user.click(screen.getByRole("switch", { name: "Disponível para uso" }));
    await user.click(screen.getByRole("button", { name: "Criar item" }));

    await waitFor(() => expect(createCatalogItem).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createCatalogItem).mock.calls[0]![0].active).toBe(false);
  });

  /** F13: money normalization — BR input becomes an exact decimal string. */
  it("F13: money is normalized to a decimal string, never a float", async () => {
    const user = userEvent.setup();
    render(<CatalogCreateForm />);

    await user.type(screen.getByLabelText("Nome"), "X");
    await user.type(screen.getByLabelText("Unidade"), "un");
    await user.type(screen.getByLabelText("Preço de venda"), "1.234,56");
    await user.click(screen.getByRole("button", { name: "Criar item" }));

    await waitFor(() => expect(createCatalogItem).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createCatalogItem).mock.calls[0]![0];
    expect(payload.sale_price).toBe("1234.56");
    expect(typeof payload.sale_price).toBe("string");
  });

  /** F14: a duplicate-code 422 shows the message right next to the código field. */
  it("F14: duplicate code error renders next to the código field", async () => {
    const { ApiValidationError } = await import("@/lib/api-client");
    vi.mocked(createCatalogItem).mockRejectedValue(
      new ApiValidationError({ code: ["Já existe um item de catálogo com este código."] })
    );

    const user = userEvent.setup();
    render(<CatalogCreateForm />);

    await user.type(screen.getByLabelText("Nome"), "X");
    await user.type(screen.getByLabelText("Unidade"), "un");
    await user.type(screen.getByLabelText(/Código/), "PINT-M2");
    await user.click(screen.getByRole("button", { name: "Criar item" }));

    await waitFor(() => expect(screen.getByText("Já existe um item de catálogo com este código.")).toBeInTheDocument());
  });

  /** F15: hostile fields are never sent. */
  it("F15: id/company_id/created_at/updated_at are never sent in the payload", async () => {
    const user = userEvent.setup();
    render(<CatalogCreateForm />);

    await user.type(screen.getByLabelText("Nome"), "X");
    await user.type(screen.getByLabelText("Unidade"), "un");
    await user.click(screen.getByRole("button", { name: "Criar item" }));

    await waitFor(() => expect(createCatalogItem).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createCatalogItem).mock.calls[0]![0];
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("company_id");
    expect(payload).not.toHaveProperty("created_at");
    expect(payload).not.toHaveProperty("updated_at");
  });

  /** F16: create success navigates to the detail page. */
  it("F16: create success navigates to /catalogo/{id}", async () => {
    const user = userEvent.setup();
    render(<CatalogCreateForm />);

    await user.type(screen.getByLabelText("Nome"), "X");
    await user.type(screen.getByLabelText("Unidade"), "un");
    await user.click(screen.getByRole("button", { name: "Criar item" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/catalogo/new-id"));
  });
});
