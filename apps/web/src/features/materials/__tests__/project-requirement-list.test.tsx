import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectRequirementList } from "../project-requirement-list";
import type { MaterialListItem, MaterialRequirement } from "../types";
import type { Project } from "@/features/projects/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const projectState: { project: Project | null | undefined; error: boolean } = { project: undefined, error: false };
const reloadProject = vi.fn();
vi.mock("@/features/projects/use-project", () => ({
  useProject: () => ({ project: projectState.project, error: projectState.error, reload: reloadProject }),
}));

const requirementsState: { requirements: MaterialRequirement[] | undefined; error: boolean } = {
  requirements: undefined,
  error: false,
};
const reloadRequirements = vi.fn();
vi.mock("../use-material-requirements", () => ({
  useMaterialRequirements: () => ({
    requirements: requirementsState.requirements,
    error: requirementsState.error,
    reload: reloadRequirements,
  }),
}));

const materialsState: { materials: MaterialListItem[] | undefined } = { materials: [] };
vi.mock("../use-all-materials", () => ({
  useAllMaterials: () => ({ materials: materialsState.materials, error: false, reload: vi.fn() }),
}));

vi.mock("@/features/purchases/prototype/goods-receipt-item-store", () => ({
  listReceiptItemsByPurchaseOrder: () => [],
}));
vi.mock("@/features/purchases/prototype/purchase-order-store", () => ({
  listPurchaseOrdersByProject: () => [],
}));
vi.mock("@/features/purchases/prototype/purchase-order-item-store", () => ({
  listItemsByPurchaseOrders: () => [],
}));
vi.mock("../prototype/material-consumption-store", () => ({
  listConsumptionsByProject: () => [],
}));
vi.mock("../prototype/material-consumption", () => ({
  removeMaterialConsumption: vi.fn(),
}));

function project(): Project {
  return {
    id: "project-a",
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

function requirement(overrides: Partial<MaterialRequirement> = {}): MaterialRequirement {
  return {
    id: "req-1",
    project_id: "project-a",
    material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: "1.250",
    notes: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

/**
 * SUPPLY-FRONTEND-01B §49 (RL1-RL12). ProjectRequirementList now sources
 * Requirements from the real API — a fetch failure must show a retry,
 * never collapse into the empty-planning state.
 */
describe("ProjectRequirementList — SUPPLY-FRONTEND-01B §49 (RL1-RL12)", () => {
  beforeEach(() => {
    push.mockReset();
    reloadProject.mockReset();
    reloadRequirements.mockReset();
    projectState.project = project();
    projectState.error = false;
    requirementsState.requirements = undefined;
    requirementsState.error = false;
    materialsState.materials = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("RL2/RL3: an API error shows an operational retry message, never the empty-planning EmptyState", async () => {
    requirementsState.requirements = undefined;
    requirementsState.error = true;
    render(<ProjectRequirementList projectId="project-a" />);

    expect(await screen.findByText(/não foi possível carregar as necessidades de materiais agora/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhum material planejado/i)).not.toBeInTheDocument();
  });

  it("RL2: the retry button calls reload()", async () => {
    requirementsState.error = true;
    render(<ProjectRequirementList projectId="project-a" />);
    const button = await screen.findByRole("button", { name: /tentar novamente/i });
    button.click();
    expect(reloadRequirements).toHaveBeenCalledTimes(1);
  });

  it("RL4: a real empty [] response produces the empty-planning EmptyState", async () => {
    requirementsState.requirements = [];
    render(<ProjectRequirementList projectId="project-a" />);
    expect(await screen.findByText(/nenhum material planejado/i)).toBeInTheDocument();
  });

  it("RL1/RL5: a real Requirement is rendered using its API material relation", async () => {
    requirementsState.requirements = [requirement()];
    materialsState.materials = [
      { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true, updated_at: "2026-09-10T00:00:00Z" },
    ];
    render(<ProjectRequirementList projectId="project-a" />);
    expect(await screen.findByText("Cimento")).toBeInTheDocument();
  });

  it("RL6: a Requirement whose Material became inactive is still displayed", async () => {
    requirementsState.requirements = [
      requirement({ material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: false } }),
    ];
    materialsState.materials = [
      { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: false, updated_at: "2026-09-10T00:00:00Z" },
    ];
    render(<ProjectRequirementList projectId="project-a" />);
    expect(await screen.findByText("(inativo)")).toBeInTheDocument();
  });

  it("RL10: the edit link uses the real Requirement id", async () => {
    requirementsState.requirements = [requirement({ id: "req-real-id" })];
    materialsState.materials = [
      { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true, updated_at: "2026-09-10T00:00:00Z" },
    ];
    const user = (await import("@testing-library/user-event")).default.setup();
    render(<ProjectRequirementList projectId="project-a" />);
    const nameNode = await screen.findByText("Cimento");
    const toggleButton = nameNode.closest("button");
    expect(toggleButton).not.toBeNull();
    await user.click(toggleButton!);
    const link = await screen.findByLabelText("Editar necessidade");
    expect(link).toHaveAttribute("href", "/obras/project-a/materiais/req-real-id/editar");
  });
});
