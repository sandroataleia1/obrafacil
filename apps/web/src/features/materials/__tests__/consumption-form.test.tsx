import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/stock/stock-client", () => ({
  getStockPosition: vi.fn(),
  createMaterialConsumption: vi.fn(),
}));

import { ApiValidationError } from "@/lib/api-client";
import { createMaterialConsumption, getStockPosition } from "@/features/stock/stock-client";
import type { StockPosition } from "@/features/stock/types";
import { ConsumptionForm } from "../consumption-form";

function position(overrides: Partial<StockPosition> = {}): StockPosition {
  return {
    project: { id: "proj-1", number: "OBR-000001", name: "Casa Oliveira" },
    material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: null,
    purchased_quantity: "0.000",
    received_quantity: "0.000",
    consumed_quantity: "0.000",
    stock_quantity: "42.000",
    pending_receipt_quantity: "0.000",
    missing_to_purchase_quantity: null,
    total_in: "42.000",
    total_out: "0.000",
    ...overrides,
  };
}

/**
 * SUPPLY-FRONTEND-01D §27-31/§51 (MC-equivalent). No Purchase Orders
 * fan-out, no local balance calc — `getStockPosition` is context only
 * (`stock_quantity` display), the real POST via `createMaterialConsumption`
 * is what the backend validates (balance/chronology), and its 422 is
 * shown verbatim.
 */
describe("ConsumptionForm — SUPPLY-FRONTEND-01D", () => {
  beforeEach(() => {
    push.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    vi.mocked(getStockPosition).mockReset().mockResolvedValue(position());
    vi.mocked(createMaterialConsumption).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("MC1: shows the current stock_quantity as context, sourced from getStockPosition", async () => {
    render(<ConsumptionForm projectId="proj-1" materialId="mat-1" />);
    expect(await screen.findByText(/disponível: 42 saco/i)).toBeInTheDocument();
  });

  it("MC2: submits a real POST to createMaterialConsumption and navigates on 201", async () => {
    vi.mocked(createMaterialConsumption).mockResolvedValue({
      id: "cons-1",
      project_id: "proj-1",
      material: position().material,
      quantity: "3.000",
      consumed_at: "2026-09-20",
      notes: null,
      created_at: "2026-09-20T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<ConsumptionForm projectId="proj-1" materialId="mat-1" />);
    await screen.findByText(/disponível: 42 saco/i);

    await user.type(screen.getByLabelText(/quantidade utilizada/i), "3");
    await user.click(screen.getByRole("button", { name: /registrar uso/i }));

    await waitFor(() => {
      expect(createMaterialConsumption).toHaveBeenCalledWith(
        "proj-1",
        expect.objectContaining({ material_id: "mat-1", quantity: "3" })
      );
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/obras/proj-1/materiais"));
  });

  it("MC3: a 422 balance/chronology error from the backend is shown verbatim, never locally reimplemented", async () => {
    vi.mocked(createMaterialConsumption).mockRejectedValue(
      new ApiValidationError({ quantity: ["Não há quantidade suficiente deste material disponível na data informada."] })
    );
    const user = userEvent.setup();
    render(<ConsumptionForm projectId="proj-1" materialId="mat-1" />);
    await screen.findByText(/disponível: 42 saco/i);

    await user.type(screen.getByLabelText(/quantidade utilizada/i), "999");
    await user.click(screen.getByRole("button", { name: /registrar uso/i }));

    expect(await screen.findByText(/não há quantidade suficiente/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("MC4: a Material that turned inactive is still consumable — submit is never blocked locally", async () => {
    vi.mocked(getStockPosition).mockResolvedValue(
      position({ material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: false } })
    );
    vi.mocked(createMaterialConsumption).mockResolvedValue({
      id: "cons-1",
      project_id: "proj-1",
      material: position().material,
      quantity: "3.000",
      consumed_at: "2026-09-20",
      notes: null,
      created_at: "2026-09-20T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<ConsumptionForm projectId="proj-1" materialId="mat-1" />);
    expect(await screen.findByText(/inativo/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/quantidade utilizada/i), "3");
    await user.click(screen.getByRole("button", { name: /registrar uso/i }));

    await waitFor(() => expect(createMaterialConsumption).toHaveBeenCalled());
  });

  it("MC5: an invalid quantity is rejected locally without calling the API", async () => {
    const user = userEvent.setup();
    render(<ConsumptionForm projectId="proj-1" materialId="mat-1" />);
    await screen.findByText(/disponível: 42 saco/i);

    await user.type(screen.getByLabelText(/quantidade utilizada/i), "0");
    await user.click(screen.getByRole("button", { name: /registrar uso/i }));

    expect(await screen.findByText(/quantidade válida/i)).toBeInTheDocument();
    expect(createMaterialConsumption).not.toHaveBeenCalled();
  });

  it("MC6: a real 404 pair (Project or Material not found) shows the not-found EmptyState", async () => {
    const { ApiError } = await import("@/lib/api-client");
    vi.mocked(getStockPosition).mockRejectedValue(new ApiError(404, "Not Found"));
    render(<ConsumptionForm projectId="proj-1" materialId="mat-1" />);
    expect(await screen.findByText(/obra ou material não encontrado/i)).toBeInTheDocument();
  });
});
