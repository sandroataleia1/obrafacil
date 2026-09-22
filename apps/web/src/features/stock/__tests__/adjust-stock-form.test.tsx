import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("projectId=proj-1&materialId=mat-1"),
}));

vi.mock("@/features/materials/use-all-materials", () => ({
  useAllMaterials: () => ({
    materials: [{ id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true, updated_at: "2026-09-10T00:00:00Z" }],
    error: false,
    reload: vi.fn(),
  }),
}));

vi.mock("@/features/projects/use-all-projects", () => ({
  useAllProjects: () => ({
    projects: [{ id: "proj-1", name: "Casa Oliveira" }],
    error: false,
    reload: vi.fn(),
  }),
}));

vi.mock("@/features/purchases/purchase-orders-client", () => ({
  listPurchaseOrderDetailsForProject: vi.fn(),
}));

vi.mock("../prototype/stock", () => ({
  getStockBalance: vi.fn(() => 10),
  createStockAdjustment: vi.fn(() => ({ ok: true, adjustment: {} })),
}));

import { listPurchaseOrderDetailsForProject } from "@/features/purchases/purchase-orders-client";
import { createStockAdjustment } from "../prototype/stock";
import { AdjustStockForm } from "../adjust-stock-form";

/**
 * SUPPLY-FRONTEND-01C1 §5/§7 (SH9-equivalent). An ADJUSTMENT_OUT/IN
 * write is blocked while the Purchase/Receipt ledger fetch is
 * pending/failed — never validated against an incomplete ledger.
 */
describe("AdjustStockForm — SUPPLY-FRONTEND-01C1", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(listPurchaseOrderDetailsForProject).mockReset();
    vi.mocked(createStockAdjustment).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("SH9: a Purchase fetch failure shows a controlled retry message and blocks the write", async () => {
    vi.mocked(listPurchaseOrderDetailsForProject).mockRejectedValue(new Error("500"));
    const user = userEvent.setup();
    render(<AdjustStockForm />);

    expect(await screen.findByText(/não foi possível carregar os recebimentos agora/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/quantidade/i), "3");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(createStockAdjustment).not.toHaveBeenCalled();
    expect(screen.getAllByText(/não foi possível carregar os recebimentos agora/i).length).toBeGreaterThan(0);
  });

  it("once Purchase data resolves, confirm proceeds and calls createStockAdjustment with the real receivedEvents", async () => {
    vi.mocked(listPurchaseOrderDetailsForProject).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<AdjustStockForm />);

    await screen.findByText(/saldo atual/i);

    await user.type(screen.getByLabelText(/quantidade/i), "3");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(createStockAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1", materialId: "mat-1" }),
      true,
      []
    );
  });
});
