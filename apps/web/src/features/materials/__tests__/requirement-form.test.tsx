import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiValidationError } from "@/lib/api-client";
import { RequirementForm } from "../requirement-form";
import type { MaterialListItem, MaterialRequirement } from "../types";
import type { Project } from "@/features/projects/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

const projectState: { project: Project | null | undefined; error: boolean } = { project: undefined, error: false };
const reloadProject = vi.fn();
vi.mock("@/features/projects/use-project", () => ({
  useProject: () => ({ project: projectState.project, error: projectState.error, reload: reloadProject }),
}));

const materialsState: { materials: MaterialListItem[] | undefined; error: boolean } = {
  materials: undefined,
  error: false,
};
vi.mock("../use-all-materials", () => ({
  useAllMaterials: () => ({ materials: materialsState.materials, error: materialsState.error, reload: vi.fn() }),
}));

const requirementState: { requirement: MaterialRequirement | null | undefined; error: boolean } = {
  requirement: undefined,
  error: false,
};
const reloadRequirement = vi.fn();
vi.mock("../use-material-requirement", () => ({
  useMaterialRequirement: () => ({
    requirement: requirementState.requirement,
    error: requirementState.error,
    reload: reloadRequirement,
  }),
}));

const existingRequirementsState: { requirements: MaterialRequirement[] | undefined } = { requirements: [] };
vi.mock("../use-material-requirements", () => ({
  useMaterialRequirements: () => ({ requirements: existingRequirementsState.requirements, error: false, reload: vi.fn() }),
}));

vi.mock("../material-requirements-client", () => ({
  createMaterialRequirement: vi.fn(),
  updateMaterialRequirement: vi.fn(),
  deleteMaterialRequirement: vi.fn(),
}));

import {
  createMaterialRequirement,
  deleteMaterialRequirement,
  updateMaterialRequirement,
} from "../material-requirements-client";

function project(overrides: Partial<Project> = {}): Project {
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
    ...overrides,
  } as Project;
}

function material(id: string, name: string, active = true): MaterialListItem {
  return { id, name, unit_code: "sc", unit_custom_label: null, active, updated_at: "2026-09-10T00:00:00Z" };
}

function requirement(overrides: Partial<MaterialRequirement> = {}): MaterialRequirement {
  return {
    id: "req-1",
    project_id: "project-a",
    material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: "1.000",
    notes: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

describe("RequirementForm — SUPPLY-FRONTEND-01B §48 (RF1-RF16)", () => {
  beforeEach(() => {
    vi.mocked(createMaterialRequirement).mockReset();
    vi.mocked(updateMaterialRequirement).mockReset();
    vi.mocked(deleteMaterialRequirement).mockReset();
    push.mockReset();
    reloadProject.mockReset();
    reloadRequirement.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    projectState.project = project();
    projectState.error = false;
    materialsState.materials = [material("mat-1", "Cimento"), material("mat-2", "Areia")];
    materialsState.error = false;
    requirementState.requirement = undefined;
    requirementState.error = false;
    existingRequirementsState.requirements = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("RF2: a Material already used in this Obra is excluded from the create selector", async () => {
    existingRequirementsState.requirements = [requirement({ material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true } })];
    render(<RequirementForm projectId="project-a" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("option", { name: /^cimento$/i })).not.toBeInTheDocument();
    expect(await screen.findByText("Areia")).toBeInTheDocument();
  });

  it("RF3: create POSTs then navigates — no browser-generated id ever involved", async () => {
    vi.mocked(createMaterialRequirement).mockResolvedValueOnce(requirement());
    const user = userEvent.setup();
    render(<RequirementForm projectId="project-a" />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Cimento" }));
    await user.type(screen.getByLabelText("Quantidade necessária"), "10");
    await user.click(screen.getByRole("button", { name: /adicionar material/i }));

    expect(createMaterialRequirement).toHaveBeenCalledWith("project-a", {
      material_id: "mat-1",
      required_quantity: "10",
      notes: null,
    });
    expect(push).toHaveBeenCalledWith("/obras/project-a/materiais");
  });

  it("RF4: a comma-typed quantity is canonicalized before being sent", async () => {
    vi.mocked(createMaterialRequirement).mockResolvedValueOnce(requirement());
    const user = userEvent.setup();
    render(<RequirementForm projectId="project-a" />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Cimento" }));
    await user.type(screen.getByLabelText("Quantidade necessária"), "1,250");
    await user.click(screen.getByRole("button", { name: /adicionar material/i }));

    expect(createMaterialRequirement).toHaveBeenCalledWith(
      "project-a",
      expect.objectContaining({ required_quantity: "1.250" })
    );
  });

  it("RF6: a duplicate-Material 422 from the backend is shown to the user", async () => {
    vi.mocked(createMaterialRequirement).mockRejectedValueOnce(
      new ApiValidationError({ material_id: ["Este material já possui uma necessidade cadastrada nesta obra."] }, null)
    );
    const user = userEvent.setup();
    render(<RequirementForm projectId="project-a" />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Cimento" }));
    await user.type(screen.getByLabelText("Quantidade necessária"), "10");
    await user.click(screen.getByRole("button", { name: /adicionar material/i }));

    expect(await screen.findByText("Este material já possui uma necessidade cadastrada nesta obra.")).toBeInTheDocument();
  });

  it("RF7/RF8: edit loads the real Requirement and shows the Material as fixed (no selector)", async () => {
    requirementState.requirement = requirement();
    render(<RequirementForm projectId="project-a" requirementId="req-1" />);

    expect(await screen.findByText("Cimento")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("RF9: an existing Requirement whose Material became inactive is still visible and editable", async () => {
    requirementState.requirement = requirement({
      material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: false },
    });
    render(<RequirementForm projectId="project-a" requirementId="req-1" />);

    expect(await screen.findByText("Cimento (inativo)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar alterações/i })).not.toBeDisabled();
  });

  it("RF10: PUT sends only required_quantity/notes, never material_id", async () => {
    requirementState.requirement = requirement();
    vi.mocked(updateMaterialRequirement).mockResolvedValueOnce(requirement({ required_quantity: "5.000" }));
    const user = userEvent.setup();
    render(<RequirementForm projectId="project-a" requirementId="req-1" />);

    await screen.findByText("Cimento");
    const input = screen.getByLabelText("Quantidade necessária");
    await user.clear(input);
    await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    expect(updateMaterialRequirement).toHaveBeenCalledWith("project-a", "req-1", {
      required_quantity: "5",
      notes: null,
    });
  });

  it("RF11: delete calls the API and navigates back on success", async () => {
    requirementState.requirement = requirement();
    vi.mocked(deleteMaterialRequirement).mockResolvedValueOnce(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<RequirementForm projectId="project-a" requirementId="req-1" />);

    await screen.findByText("Cimento");
    await user.click(screen.getByRole("button", { name: /excluir/i }));

    expect(deleteMaterialRequirement).toHaveBeenCalledWith("project-a", "req-1");
    expect(push).toHaveBeenCalledWith("/obras/project-a/materiais");
  });

  it("RF12: a real 404 on edit is distinct from a load error", async () => {
    requirementState.requirement = null;
    requirementState.error = false;
    render(<RequirementForm projectId="project-a" requirementId="req-1" />);
    expect(await screen.findByText("Material não encontrado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tentar novamente/i })).not.toBeInTheDocument();
  });

  it("RF13: a load error on edit shows retry wired to reload()", async () => {
    requirementState.requirement = undefined;
    requirementState.error = true;
    const user = userEvent.setup();
    render(<RequirementForm projectId="project-a" requirementId="req-1" />);
    await user.click(await screen.findByRole("button", { name: /tentar novamente/i }));
    expect(reloadRequirement).toHaveBeenCalledTimes(1);
  });

  it("RF14: a stale Company switch during a pending create suppresses navigation", async () => {
    let resolveCreate!: (value: MaterialRequirement) => void;
    vi.mocked(createMaterialRequirement).mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve; }));
    const user = userEvent.setup();
    const { rerender } = render(<RequirementForm projectId="project-a" />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Cimento" }));
    await user.type(screen.getByLabelText("Quantidade necessária"), "10");
    await user.click(screen.getByRole("button", { name: /adicionar material/i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<RequirementForm projectId="project-a" />);

    resolveCreate(requirement());
    await new Promise((r) => setTimeout(r, 0));

    expect(push).not.toHaveBeenCalled();
  });

  it("RF15: a stale Project switch during a pending create suppresses navigation", async () => {
    let resolveCreate!: (value: MaterialRequirement) => void;
    vi.mocked(createMaterialRequirement).mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve; }));
    const user = userEvent.setup();
    const { rerender } = render(<RequirementForm projectId="project-a" />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Cimento" }));
    await user.type(screen.getByLabelText("Quantidade necessária"), "10");
    await user.click(screen.getByRole("button", { name: /adicionar material/i }));

    rerender(<RequirementForm projectId="project-b" />);

    resolveCreate(requirement());
    await new Promise((r) => setTimeout(r, 0));

    expect(push).not.toHaveBeenCalledWith("/obras/project-a/materiais");
  });
});
