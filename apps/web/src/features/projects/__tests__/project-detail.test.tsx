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

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../projects-client", () => ({
  getProject: vi.fn(),
  updateProject: vi.fn(),
}));

const requirementsState: { requirements: unknown[] | undefined; error: boolean } = {
  requirements: [],
  error: false,
};
const reloadRequirements = vi.fn();
vi.mock("@/features/materials/use-material-requirements", () => ({
  useMaterialRequirements: () => ({
    requirements: requirementsState.requirements,
    error: requirementsState.error,
    reload: reloadRequirements,
  }),
}));

vi.mock("@/features/purchases/purchase-orders-client", () => ({
  listPurchaseOrderDetailsForProject: vi.fn().mockResolvedValue([]),
}));

import { ApiError } from "@/lib/api-client";
import { getProject, updateProject } from "../projects-client";
import { ProjectDetail } from "../project-detail";
import type { Project } from "../types";
import type { MaterialRequirement } from "@/features/materials/types";

function requirement(overrides: Partial<MaterialRequirement> = {}): MaterialRequirement {
  return {
    id: "req-1",
    project_id: "proj-1",
    material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: "1.000",
    notes: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    number: "OBR-000001",
    name: "Casa Oliveira",
    status: "planning",
    reference: null,
    customer: { id: "cust-1", name: "João da Silva" },
    customer_address_id: null,
    address: null,
    expected_start_date: null,
    expected_end_date: null,
    source_budget: null,
    created_at: "2026-09-01T00:00:00.000000Z",
    updated_at: "2026-09-01T00:00:00.000000Z",
    ...overrides,
  };
}

describe("ProjectDetail", () => {
  beforeEach(() => {
    vi.mocked(getProject).mockReset();
    vi.mocked(updateProject).mockReset();
    push.mockReset();
    reloadRequirements.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    requirementsState.requirements = [];
    requirementsState.error = false;
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("PD1/PD5: GET loads the Project and renders number/name/Customer", async () => {
    vi.mocked(getProject).mockResolvedValue(project());
    render(<ProjectDetail id="proj-1" />);
    await screen.findByText(/OBR-000001/);
    expect(screen.getByText("João da Silva")).toBeInTheDocument();
  });

  it("PD2: shows a loading state before the response resolves", () => {
    vi.mocked(getProject).mockReturnValue(new Promise(() => {}));
    render(<ProjectDetail id="proj-1" />);
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("PD3: a 404 shows a not-found message", async () => {
    vi.mocked(getProject).mockRejectedValue(new ApiError(404, "Not found"));
    render(<ProjectDetail id="missing" />);
    await screen.findByText("Obra não encontrada");
  });

  it("PD4: a network error shows a retry affordance", async () => {
    vi.mocked(getProject).mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<ProjectDetail id="proj-1" />);

    await screen.findByRole("button", { name: /tentar novamente/i });
    vi.mocked(getProject).mockResolvedValueOnce(project());
    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));

    await screen.findByText(/OBR-000001/);
  });

  it("PD6: renders the structured address, never a raw string", async () => {
    vi.mocked(getProject).mockResolvedValue(
      project({
        address: {
          postal_code: "01310100",
          street: "Av. Paulista",
          number: "1000",
          complement: null,
          neighborhood: "Bela Vista",
          city: "São Paulo",
          state: "SP",
          reference_point: null,
        },
      })
    );
    render(<ProjectDetail id="proj-1" />);
    await screen.findByText(/Av. Paulista, 1000/);
    await screen.findByText(/São Paulo\/SP/);
  });

  it("PD7: expected_end_date renders via the civil-date helper (dd/mm/yyyy), never a Date-object reparse", async () => {
    vi.mocked(getProject).mockResolvedValue(project({ status: "in_progress", expected_end_date: "2026-12-31" }));
    render(<ProjectDetail id="proj-1" />);
    await screen.findByText(/31\/12\/2026/);
  });

  it("PD8: shows the source Budget summary (number + total) and links to /orcamentos/{id}, never fetches the Budget separately", async () => {
    vi.mocked(getProject).mockResolvedValue(
      project({ source_budget: { id: "budget-1", number: "ORC-000001", total: "1500.00" } })
    );
    render(<ProjectDetail id="proj-1" />);
    const link = await screen.findByRole("link", { name: /ORC-000001/ });
    expect(link).toHaveAttribute("href", "/orcamentos/budget-1");
  });

  it("PD8b: with no source_budget, shows 'Sem orçamento vinculado'", async () => {
    vi.mocked(getProject).mockResolvedValue(project());
    render(<ProjectDetail id="proj-1" />);
    await screen.findByText("Sem orçamento vinculado");
  });

  it("PD9/PD10: clicking a status button PUTs {status, updated_at} and the response replaces the Project entirely", async () => {
    vi.mocked(getProject).mockResolvedValue(project());
    vi.mocked(updateProject).mockResolvedValue(project({ status: "in_progress", updated_at: "2026-09-02T00:00:00.000000Z" }));
    const user = userEvent.setup();
    render(<ProjectDetail id="proj-1" />);
    await screen.findByText(/OBR-000001/);

    await user.click(screen.getByRole("button", { name: "Em andamento" }));

    await waitFor(() => expect(updateProject).toHaveBeenCalledWith("proj-1", { status: "in_progress", updated_at: "2026-09-01T00:00:00.000000Z" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Em andamento" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("PD11: a 409 on status change refetches the Project and shows a notice, never overwrites with stale data", async () => {
    vi.mocked(getProject)
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(project({ status: "paused", updated_at: "2026-09-05T00:00:00.000000Z" }));
    vi.mocked(updateProject).mockRejectedValue(new ApiError(409, "Conflict"));
    const user = userEvent.setup();
    render(<ProjectDetail id="proj-1" />);
    await screen.findByText(/OBR-000001/);

    await user.click(screen.getByRole("button", { name: "Concluída" }));

    await screen.findByText(/A obra foi alterada por outra pessoa/);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pausada" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("PD12: a late GET for Company A never repaints under Company B", async () => {
    let resolveA!: (value: Project) => void;
    const aPromise = new Promise<Project>((resolve) => {
      resolveA = resolve;
    });
    vi.mocked(getProject).mockReturnValueOnce(aPromise).mockResolvedValueOnce(project({ name: "Obra B" }));

    const { rerender } = render(<ProjectDetail id="proj-1" />);
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ProjectDetail id="proj-1" />);
    await screen.findAllByText(/Obra B/);

    resolveA(project({ name: "Obra A" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText(/Obra A/)).not.toBeInTheDocument();
  });

  /**
   * TD4/§20: a status-change PUT for Company A is in flight, the switch
   * to Company B commits, and A's PUT resolves in the SAME synchronous
   * block as the switch (before any further `await`). A's response must
   * never write `project`/`statusActionLoading` under B.
   */
  it("TD4: a status-PUT response for Company A resolving in the exact tick after switching to B never writes Company B's state", async () => {
    vi.mocked(getProject)
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(project({ name: "Obra B", status: "planning" }));
    let resolvePut!: (value: Project) => void;
    vi.mocked(updateProject).mockReturnValue(
      new Promise((resolve) => {
        resolvePut = resolve;
      })
    );
    const user = userEvent.setup();
    const { rerender } = render(<ProjectDetail id="proj-1" />);
    await screen.findByText(/OBR-000001/);

    await user.click(screen.getByRole("button", { name: "Em andamento" }));
    await waitFor(() => expect(updateProject).toHaveBeenCalled());

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ProjectDetail id="proj-1" />);
    resolvePut(project({ status: "in_progress", updated_at: "2026-09-02T00:00:00.000000Z" }));
    await screen.findAllByText(/Obra B/);

    expect(screen.getByRole("button", { name: "Planejamento" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Em andamento" })?.getAttribute("aria-pressed")).not.toBe("true");
  });

  /**
   * TD5/§20: the 409 conflict path's own silent `refreshAfterConflict`
   * re-fetch for Company A resolving after the switch to B must also be
   * discarded — never overwrites B's freshly-loaded Project.
   */
  it("TD5: Company A's 409-triggered silent refresh never writes Company B's state", async () => {
    vi.mocked(getProject)
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(project({ name: "Obra B", status: "planning" }));
    let rejectPut!: (error: unknown) => void;
    vi.mocked(updateProject).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectPut = reject;
      })
    );
    const user = userEvent.setup();
    const { rerender } = render(<ProjectDetail id="proj-1" />);
    await screen.findByText(/OBR-000001/);

    await user.click(screen.getByRole("button", { name: "Concluída" }));
    await waitFor(() => expect(updateProject).toHaveBeenCalled());

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ProjectDetail id="proj-1" />);
    rejectPut(new ApiError(409, "Conflict"));
    await screen.findAllByText(/Obra B/);

    expect(screen.queryByText(/A obra foi alterada por outra pessoa/)).not.toBeInTheDocument();
  });

  it("PD14: the reference-amount card is derived from source_budget.total, not any legacy Budget prototype lookup", async () => {
    vi.mocked(getProject).mockResolvedValue(
      project({ source_budget: { id: "budget-1", number: "ORC-000001", total: "2000.00" } })
    );
    render(<ProjectDetail id="proj-1" />);
    await screen.findByText(/OBR-000001/);
    await screen.findByText("Valor do orçamento");
    expect(screen.getAllByText("R$ 2.000,00").length).toBeGreaterThan(0);
  });

  /**
   * SUPPLY-FRONTEND-01B1 §4-7/§27 (PD1-PD7). The "Materiais" section now
   * sources Requirements from the real API — never the removed legacy
   * local store.
   */
  describe("Materiais section — SUPPLY-FRONTEND-01B1 §27 (PD1-PD7)", () => {
    it("PD1: a real API Requirement appears using requirement.material's live relation", async () => {
      vi.mocked(getProject).mockResolvedValue(project());
      requirementsState.requirements = [requirement()];
      render(<ProjectDetail id="proj-1" />);
      await screen.findByText(/OBR-000001/);
      expect(await screen.findByText("Cimento")).toBeInTheDocument();
    });

    it("PD2: a real empty [] response shows the empty-planning state", async () => {
      vi.mocked(getProject).mockResolvedValue(project());
      requirementsState.requirements = [];
      render(<ProjectDetail id="proj-1" />);
      await screen.findByText(/OBR-000001/);
      expect(await screen.findByText(/nenhum material planejado/i)).toBeInTheDocument();
    });

    it("PD3/PD4: an API error shows a retry message, never the empty-planning state", async () => {
      vi.mocked(getProject).mockResolvedValue(project());
      requirementsState.requirements = undefined;
      requirementsState.error = true;
      render(<ProjectDetail id="proj-1" />);
      await screen.findByText(/OBR-000001/);
      expect(await screen.findByText(/não foi possível carregar as necessidades de materiais agora/i)).toBeInTheDocument();
      expect(screen.queryByText(/nenhum material planejado/i)).not.toBeInTheDocument();
    });

    it("PD4: the retry button calls reload()", async () => {
      vi.mocked(getProject).mockResolvedValue(project());
      requirementsState.requirements = undefined;
      requirementsState.error = true;
      const user = userEvent.setup();
      render(<ProjectDetail id="proj-1" />);
      await screen.findByText(/OBR-000001/);
      const buttons = await screen.findAllByRole("button", { name: /tentar novamente/i });
      await user.click(buttons[buttons.length - 1]);
      expect(reloadRequirements).toHaveBeenCalledTimes(1);
    });

    it("PD5: required_quantity bridges to the local planning calculator without changing the API decimal string", async () => {
      vi.mocked(getProject).mockResolvedValue(project());
      requirementsState.requirements = [requirement({ required_quantity: "8.500" })];
      const user = userEvent.setup();
      render(<ProjectDetail id="proj-1" />);
      await screen.findByText(/OBR-000001/);
      const materialButton = (await screen.findByText("Cimento")).closest("button");
      expect(materialButton).not.toBeNull();
      await user.click(materialButton!);
      expect((await screen.findAllByText(/8,5/)).length).toBeGreaterThan(0);
    });

    it("PD6: a Requirement whose Material relation is inactive still renders", async () => {
      vi.mocked(getProject).mockResolvedValue(project());
      requirementsState.requirements = [
        requirement({ material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: false } }),
      ];
      render(<ProjectDetail id="proj-1" />);
      await screen.findByText(/OBR-000001/);
      expect(await screen.findByText("Cimento")).toBeInTheDocument();
    });
  });
});
