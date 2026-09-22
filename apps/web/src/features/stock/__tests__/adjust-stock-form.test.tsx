import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("projectId=proj-1&materialId=mat-1"),
}));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
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

vi.mock("../stock-client", () => ({
  getStockPosition: vi.fn(),
  createStockAdjustment: vi.fn(),
}));

import { ApiValidationError } from "@/lib/api-client";
import { createStockAdjustment, getStockPosition } from "../stock-client";
import { AdjustStockForm } from "../adjust-stock-form";
import type { StockPosition } from "../types";

function position(overrides: Partial<StockPosition> = {}): StockPosition {
  return {
    project: { id: "proj-1", number: "OBR-1", name: "Casa Oliveira" },
    material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: null,
    purchased_quantity: "0.000",
    received_quantity: "0.000",
    consumed_quantity: "0.000",
    stock_quantity: "10.000",
    pending_receipt_quantity: "0.000",
    missing_to_purchase_quantity: null,
    total_in: "10.000",
    total_out: "0.000",
    ...overrides,
  };
}

/**
 * SUPPLY-FRONTEND-01D §32-34/§51: SA1-SA14-equivalent coverage — real
 * POST via `createStockAdjustment`, `getStockPosition` used only as
 * context (never a submit-blocking authority), server 422 shown
 * verbatim, tenant-owned via the outer/keyed-Inner wrapper.
 */
describe("AdjustStockForm — SUPPLY-FRONTEND-01D", () => {
  beforeEach(() => {
    push.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    vi.mocked(getStockPosition).mockReset().mockResolvedValue(position());
    vi.mocked(createStockAdjustment).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("SA1: shows the current stock_quantity as context, sourced from getStockPosition", async () => {
    render(<AdjustStockForm />);
    expect(await screen.findByText(/saldo atual/i)).toBeInTheDocument();
    expect(await screen.findByText(/10 saco/i)).toBeInTheDocument();
  });

  it("SA2: submits a real POST to createStockAdjustment and navigates on 201", async () => {
    vi.mocked(createStockAdjustment).mockResolvedValue({
      id: "adj-1",
      project_id: "proj-1",
      material: position().material,
      type: "ADJUSTMENT_IN",
      quantity: "3.000",
      occurred_at: "2026-09-20",
      reason: null,
      created_at: "2026-09-20T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<AdjustStockForm />);
    await screen.findByText(/saldo atual/i);

    await user.type(screen.getByLabelText(/quantidade/i), "3");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(createStockAdjustment).toHaveBeenCalledWith(
        "proj-1",
        expect.objectContaining({ material_id: "mat-1", type: "ADJUSTMENT_IN", quantity: "3" })
      );
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/estoque/proj-1/mat-1"));
  });

  it("SA3: a 422 balance/chronology error from the backend is shown verbatim, never locally reimplemented", async () => {
    vi.mocked(createStockAdjustment).mockRejectedValue(
      new ApiValidationError({ quantity: ["Não há quantidade suficiente deste material disponível na data informada."] })
    );
    const user = userEvent.setup();
    render(<AdjustStockForm />);
    await screen.findByText(/saldo atual/i);

    await user.type(screen.getByLabelText(/quantidade/i), "999");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText(/não há quantidade suficiente/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("SA4: getStockPosition failing never blocks submission — the backend remains the sole authority", async () => {
    vi.mocked(getStockPosition).mockRejectedValue(new Error("network"));
    vi.mocked(createStockAdjustment).mockResolvedValue({
      id: "adj-1",
      project_id: "proj-1",
      material: position().material,
      type: "ADJUSTMENT_IN",
      quantity: "3.000",
      occurred_at: "2026-09-20",
      reason: null,
      created_at: "2026-09-20T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<AdjustStockForm />);

    await user.type(screen.getByLabelText(/quantidade/i), "3");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(createStockAdjustment).toHaveBeenCalled());
  });
});
