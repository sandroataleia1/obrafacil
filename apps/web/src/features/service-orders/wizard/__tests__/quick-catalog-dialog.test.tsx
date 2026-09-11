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

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/catalog/catalog-client", () => ({
  createCatalogItem: vi.fn(),
}));

import { createCatalogItem } from "@/features/catalog/catalog-client";
import { QuickCatalogDialog } from "../quick-catalog-dialog";

describe("QuickCatalogDialog", () => {
  beforeEach(() => {
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("QI1: pre-sets the type from presetType='service'", () => {
    render(<QuickCatalogDialog open onOpenChange={() => {}} presetType="service" onCreated={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Serviço" })).toHaveAttribute("aria-pressed", "true");
  });

  it("QI2: pre-sets the type from presetType='product'", () => {
    render(<QuickCatalogDialog open onOpenChange={() => {}} presetType="product" onCreated={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Produto" })).toHaveAttribute("aria-pressed", "true");
  });

  it("QI3: always sends active: true", async () => {
    vi.mocked(createCatalogItem).mockResolvedValue({ id: "item-1", name: "Pintura" } as never);
    const user = userEvent.setup();
    render(<QuickCatalogDialog open onOpenChange={() => {}} presetType="service" onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome"), "Pintura");
    await user.type(screen.getByLabelText("Unidade"), "m²");
    await user.click(screen.getByRole("button", { name: /salvar e adicionar/i }));

    await waitFor(() => expect(createCatalogItem).toHaveBeenCalled());
    expect(vi.mocked(createCatalogItem).mock.calls[0]![0].active).toBe(true);
  });

  it("QI4: sends type=product when presetType is product", async () => {
    vi.mocked(createCatalogItem).mockResolvedValue({ id: "item-1", name: "Cimento" } as never);
    const user = userEvent.setup();
    render(<QuickCatalogDialog open onOpenChange={() => {}} presetType="product" onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome"), "Cimento");
    await user.type(screen.getByLabelText("Unidade"), "sc");
    await user.click(screen.getByRole("button", { name: /salvar e adicionar/i }));

    await waitFor(() => expect(createCatalogItem).toHaveBeenCalled());
    expect(vi.mocked(createCatalogItem).mock.calls[0]![0].type).toBe("product");
  });

  it("QI5: calls onCreated with the created item so it can be added straight to the draft", async () => {
    const created = { id: "item-1", name: "Pintura", type: "service", sale_price: "150.00" };
    vi.mocked(createCatalogItem).mockResolvedValue(created as never);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<QuickCatalogDialog open onOpenChange={() => {}} presetType="service" onCreated={onCreated} />);

    await user.type(screen.getByLabelText("Nome"), "Pintura");
    await user.type(screen.getByLabelText("Unidade"), "m²");
    await user.click(screen.getByRole("button", { name: /salvar e adicionar/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
  });

  it("QI6: the submit button is disabled until name and unit are entered", () => {
    render(<QuickCatalogDialog open onOpenChange={() => {}} presetType="service" onCreated={vi.fn()} />);
    expect(screen.getByRole("button", { name: /salvar e adicionar/i })).toBeDisabled();
  });

  it("QI7: cost price is optional — omitting it never blocks submission", async () => {
    vi.mocked(createCatalogItem).mockResolvedValue({ id: "item-1", name: "Pintura" } as never);
    const user = userEvent.setup();
    render(<QuickCatalogDialog open onOpenChange={() => {}} presetType="service" onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome"), "Pintura");
    await user.type(screen.getByLabelText("Unidade"), "m²");
    await user.click(screen.getByRole("button", { name: /salvar e adicionar/i }));

    await waitFor(() => expect(createCatalogItem).toHaveBeenCalled());
    expect(vi.mocked(createCatalogItem).mock.calls[0]![0].cost_price).toBeNull();
  });

  it("QI8: a filled sale price is normalized to a decimal string", async () => {
    vi.mocked(createCatalogItem).mockResolvedValue({ id: "item-1", name: "Pintura" } as never);
    const user = userEvent.setup();
    render(<QuickCatalogDialog open onOpenChange={() => {}} presetType="service" onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome"), "Pintura");
    await user.type(screen.getByLabelText("Unidade"), "m²");
    await user.type(screen.getByLabelText("Preço de venda"), "150,00");
    await user.click(screen.getByRole("button", { name: /salvar e adicionar/i }));

    await waitFor(() => expect(createCatalogItem).toHaveBeenCalled());
    expect(vi.mocked(createCatalogItem).mock.calls[0]![0].sale_price).toBe("150.00");
  });

  it("QI9: shows a generic error on an unexpected failure", async () => {
    vi.mocked(createCatalogItem).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<QuickCatalogDialog open onOpenChange={() => {}} presetType="service" onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome"), "Pintura");
    await user.type(screen.getByLabelText("Unidade"), "m²");
    await user.click(screen.getByRole("button", { name: /salvar e adicionar/i }));

    await waitFor(() => expect(screen.getByText(/não foi possível criar o item/i)).toBeInTheDocument());
  });

  it("QI10: cancelling never calls createCatalogItem", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<QuickCatalogDialog open onOpenChange={onOpenChange} presetType="service" onCreated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^cancelar$/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createCatalogItem).not.toHaveBeenCalled();
  });

  it("OT8/OT9: a create response that resolves after a company switch never calls onCreated (product or service)", async () => {
    let resolveCreate!: (value: unknown) => void;
    const createPromise = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(createCatalogItem).mockReturnValue(createPromise as never);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<QuickCatalogDialog open onOpenChange={() => {}} presetType="product" onCreated={onCreated} />);

    await user.type(screen.getByLabelText("Nome"), "Cimento da Empresa A");
    await user.type(screen.getByLabelText("Unidade"), "sc");
    await user.click(screen.getByRole("button", { name: /salvar e adicionar/i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<QuickCatalogDialog open onOpenChange={() => {}} presetType="product" onCreated={onCreated} />);

    resolveCreate({ id: "item-old", name: "Cimento da Empresa A", type: "product" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onCreated).not.toHaveBeenCalled();
  });

  it("closes itself and clears the typed fields if the active company changes while open", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <QuickCatalogDialog open onOpenChange={onOpenChange} presetType="service" onCreated={vi.fn()} />
    );

    await user.type(screen.getByLabelText("Nome"), "Pintura da Empresa A");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<QuickCatalogDialog open onOpenChange={onOpenChange} presetType="service" onCreated={vi.fn()} />);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.getByLabelText("Nome")).toHaveValue("");
  });
});
