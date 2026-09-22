import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const projectState: { project: unknown; error: boolean } = { project: undefined, error: false };
vi.mock("@/features/projects/use-project", () => ({
  useProject: () => ({ project: projectState.project, error: projectState.error, reload: vi.fn() }),
}));

vi.mock("@/features/purchases/purchase-orders-client", () => ({
  listPurchaseOrderDetailsForProject: vi.fn(),
}));

const materialState: { material: unknown; error: boolean } = { material: undefined, error: false };
vi.mock("../use-material", () => ({
  useMaterial: () => ({ material: materialState.material, error: materialState.error, reload: vi.fn() }),
}));

vi.mock("../prototype/material-consumption", () => ({
  calculateAvailableQuantity: vi.fn(() => 42),
  registerMaterialConsumption: vi.fn(() => ({ ok: true, consumption: {} })),
}));

import { listPurchaseOrderDetailsForProject } from "@/features/purchases/purchase-orders-client";
import { registerMaterialConsumption } from "../prototype/material-consumption";
import { ConsumptionForm } from "../consumption-form";
import type { Project } from "@/features/projects/types";
import type { MaterialListItem } from "../types";

function project(): Project {
  return {
    id: "proj-1",
    number: "OBR-000001",
    name: "Casa Oliveira",
    status: "in_progress",
    reference: null,
    customer: { id: "cust-1", name: "João" },
    customer_address_id: null,
    address: null,
    expected_start_date: null,
    expected_end_date: null,
    source_budget: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
}

function material(): MaterialListItem {
  return { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true, updated_at: "2026-09-10T00:00:00Z" };
}

/**
 * SUPPLY-FRONTEND-01C1 §4/§7 (SH7/SH8-equivalent). A Purchase/Receipt
 * API failure fails CLOSED for Consumption: "Disponível" is never shown
 * as a fabricated value, and the write is blocked with a controlled
 * message — `registerMaterialConsumption` (the real write path) is
 * never called while the fetch is pending or has failed.
 */
describe("ConsumptionForm — SUPPLY-FRONTEND-01C1", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(listPurchaseOrderDetailsForProject).mockReset();
    vi.mocked(registerMaterialConsumption).mockClear();
    projectState.project = project();
    projectState.error = false;
    materialState.material = material();
    materialState.error = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("SH7: while the Purchase fetch is pending, submit is blocked and never calls registerMaterialConsumption", async () => {
    vi.mocked(listPurchaseOrderDetailsForProject).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<ConsumptionForm projectId="proj-1" materialId="mat-1" />);

    await user.type(await screen.findByLabelText(/quantidade utilizada/i), "3");
    await user.click(screen.getByRole("button", { name: /registrar uso/i }));

    expect(registerMaterialConsumption).not.toHaveBeenCalled();
  });

  it("SH8: a Purchase fetch failure shows a controlled retry message and blocks the write", async () => {
    vi.mocked(listPurchaseOrderDetailsForProject).mockRejectedValue(new Error("500"));
    const user = userEvent.setup();
    render(<ConsumptionForm projectId="proj-1" materialId="mat-1" />);

    expect(await screen.findByText(/não foi possível carregar os recebimentos agora/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/quantidade utilizada/i), "3");
    await user.click(screen.getByRole("button", { name: /registrar uso/i }));

    expect(registerMaterialConsumption).not.toHaveBeenCalled();
    expect(screen.getByText(/não foi possível carregar os recebimentos agora/i)).toBeInTheDocument();
  });

  it("once Purchase data resolves, submit proceeds and calls registerMaterialConsumption with the real receivedEvents", async () => {
    vi.mocked(listPurchaseOrderDetailsForProject).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<ConsumptionForm projectId="proj-1" materialId="mat-1" />);

    expect(await screen.findByText(/disponível: 42/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/quantidade utilizada/i), "3");
    await user.click(screen.getByRole("button", { name: /registrar uso/i }));

    expect(registerMaterialConsumption).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1", materialId: "mat-1", quantity: 3 }),
      true,
      []
    );
  });
});
