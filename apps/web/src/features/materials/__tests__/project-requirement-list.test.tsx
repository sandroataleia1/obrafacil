import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectRequirementList } from "../project-requirement-list";
import type { MaterialRequirement } from "../types";
import type { StockPosition } from "@/features/stock/types";
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

vi.mock("@/features/stock/stock-client", () => ({
  listAllStockPositions: vi.fn(),
  listStockMovements: vi.fn(),
  deleteMaterialConsumption: vi.fn(),
}));

import { listAllStockPositions } from "@/features/stock/stock-client";

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

function position(overrides: Partial<StockPosition> = {}): StockPosition {
  return {
    project: { id: "project-a", number: "OBR-000001", name: "Casa Oliveira" },
    material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: "1.250",
    purchased_quantity: "0.000",
    received_quantity: "0.000",
    consumed_quantity: "0.000",
    stock_quantity: "0.000",
    pending_receipt_quantity: "0.000",
    missing_to_purchase_quantity: "1.250",
    total_in: "0.000",
    total_out: "0.000",
    ...overrides,
  };
}

/**
 * SUPPLY-FRONTEND-01D §37 (CI-equivalent). ProjectRequirementList now
 * sources its per-Material planning from real `StockPosition`
 * (`listAllStockPositions`) instead of the removed local Purchase
 * calculators — a fetch error must show a retry, never collapse into
 * the empty-planning state; `useMaterialRequirements` stays only for
 * the "Editar necessidade" link's Requirement id.
 */
describe("ProjectRequirementList — SUPPLY-FRONTEND-01D", () => {
  beforeEach(() => {
    push.mockReset();
    reloadProject.mockReset();
    reloadRequirements.mockReset();
    projectState.project = project();
    projectState.error = false;
    requirementsState.requirements = undefined;
    requirementsState.error = false;
    vi.mocked(listAllStockPositions).mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows an operational retry message on Requirements error, never the empty-planning EmptyState", async () => {
    requirementsState.requirements = undefined;
    requirementsState.error = true;
    render(<ProjectRequirementList projectId="project-a" />);

    expect(await screen.findByText(/não foi possível carregar as necessidades de materiais agora/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhum material planejado/i)).not.toBeInTheDocument();
  });

  it("the Requirements retry button calls reload()", async () => {
    requirementsState.error = true;
    render(<ProjectRequirementList projectId="project-a" />);
    const button = await screen.findByRole("button", { name: /tentar novamente/i });
    button.click();
    expect(reloadRequirements).toHaveBeenCalledTimes(1);
  });

  it("shows an operational retry message when StockPosition fetch fails", async () => {
    requirementsState.requirements = [];
    vi.mocked(listAllStockPositions).mockReset().mockRejectedValue(new Error("500"));
    render(<ProjectRequirementList projectId="project-a" />);

    expect(await screen.findByText(/não foi possível carregar os materiais desta obra agora/i)).toBeInTheDocument();
  });

  it("a real empty [] positions response produces the empty-planning EmptyState", async () => {
    requirementsState.requirements = [];
    vi.mocked(listAllStockPositions).mockResolvedValue([]);
    render(<ProjectRequirementList projectId="project-a" />);
    expect(await screen.findByText(/nenhum material planejado/i)).toBeInTheDocument();
  });

  it("a real StockPosition is rendered using its embedded Material", async () => {
    requirementsState.requirements = [requirement()];
    vi.mocked(listAllStockPositions).mockResolvedValue([position()]);
    render(<ProjectRequirementList projectId="project-a" />);
    expect(await screen.findByText("Cimento")).toBeInTheDocument();
  });

  it("a Material that became inactive is still displayed", async () => {
    requirementsState.requirements = [
      requirement({ material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: false } }),
    ];
    vi.mocked(listAllStockPositions).mockResolvedValue([
      position({ material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: false } }),
    ]);
    render(<ProjectRequirementList projectId="project-a" />);
    expect(await screen.findByText("(inativo)")).toBeInTheDocument();
  });

  it("the edit link uses the real Requirement id", async () => {
    requirementsState.requirements = [requirement({ id: "req-real-id" })];
    vi.mocked(listAllStockPositions).mockResolvedValue([position()]);
    const user = (await import("@testing-library/user-event")).default.setup();
    render(<ProjectRequirementList projectId="project-a" />);
    const nameNode = await screen.findByText("Cimento");
    const toggleButton = nameNode.closest("button");
    expect(toggleButton).not.toBeNull();
    await user.click(toggleButton!);
    const link = await screen.findByLabelText("Editar necessidade");
    expect(link).toHaveAttribute("href", "/obras/project-a/materiais/req-real-id/editar");
  });

  it("a StockPosition with no Requirement shows 'Não planejado' instead of a required quantity", async () => {
    requirementsState.requirements = [];
    vi.mocked(listAllStockPositions).mockResolvedValue([position({ required_quantity: null, missing_to_purchase_quantity: null })]);
    const user = (await import("@testing-library/user-event")).default.setup();
    render(<ProjectRequirementList projectId="project-a" />);
    const nameNode = await screen.findByText("Cimento");
    await user.click(nameNode.closest("button")!);
    expect(await screen.findByText("Não planejado")).toBeInTheDocument();
  });
});
