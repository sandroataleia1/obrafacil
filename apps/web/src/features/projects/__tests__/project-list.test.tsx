import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectList } from "../project-list";
import type { ProjectListItem, ProjectPaginationResponse } from "../types";

const refresh = vi.fn();
const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ ...authState, refresh }),
}));

vi.mock("../projects-client", () => ({
  listProjects: vi.fn(),
}));

import { listProjects } from "../projects-client";

function item(number: string, overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    id: `id-${number}`,
    number,
    name: "Casa Oliveira",
    status: "planning",
    reference: null,
    customer: { id: "cust-1", name: "João da Silva" },
    expected_start_date: null,
    expected_end_date: null,
    source_budget: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function page(numbers: string[], currentPage = 1, lastPage = 1): ProjectPaginationResponse {
  return {
    data: numbers.map((number) => item(number)),
    meta: { current_page: currentPage, from: 1, last_page: lastPage, per_page: 15, to: numbers.length, total: numbers.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

describe("ProjectList", () => {
  beforeEach(() => {
    vi.mocked(listProjects).mockReset();
    refresh.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("PL1: shows loading skeleton before the first response resolves", async () => {
    let resolve!: (value: ProjectPaginationResponse) => void;
    vi.mocked(listProjects).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ProjectList />);
    expect(screen.getByRole("status", { hidden: true })).toBeInTheDocument();
    resolve(page(["OBR-000001"]));
    await screen.findAllByText("OBR-000001");
  });

  it("PL2: renders Company A's projects", async () => {
    vi.mocked(listProjects).mockResolvedValue(page(["OBR-000001", "OBR-000002"]));
    render(<ProjectList />);

    await screen.findAllByText("OBR-000001");
    expect(screen.queryAllByText("OBR-000002").length).toBeGreaterThan(0);
  });

  it("PL3: the OBR number is shown verbatim, never reformatted", async () => {
    vi.mocked(listProjects).mockResolvedValue(page(["OBR-000042"]));
    render(<ProjectList />);
    await screen.findAllByText("OBR-000042");
  });

  it("PL4: the live Customer name is shown", async () => {
    vi.mocked(listProjects).mockResolvedValue({
      ...page(["OBR-000001"]),
      data: [item("OBR-000001", { customer: { id: "cust-1", name: "Fernanda Lima" } })],
    });
    render(<ProjectList />);
    await screen.findAllByText("Fernanda Lima");
  });

  it("PL5: shows the source Budget's number and formatted total when present", async () => {
    vi.mocked(listProjects).mockResolvedValue({
      ...page(["OBR-000001"]),
      data: [item("OBR-000001", { source_budget: { id: "budget-1", number: "ORC-000001", total: "1500.50" } })],
    });
    render(<ProjectList />);
    await screen.findAllByText(/ORC-000001/);
    expect(screen.getAllByText(/R\$\s*1\.500,50/).length).toBeGreaterThan(0);
  });

  it("PL6: shows 'Sem orçamento de origem' when source_budget is null", async () => {
    vi.mocked(listProjects).mockResolvedValue(page(["OBR-000001"]));
    render(<ProjectList />);
    await screen.findAllByText("Sem orçamento de origem");
  });

  it("PL7: search input debounces and sends the search param to the backend", async () => {
    vi.mocked(listProjects).mockResolvedValue(page(["OBR-000001"]));
    const user = userEvent.setup();
    render(<ProjectList />);
    await screen.findAllByText("OBR-000001");

    await user.type(screen.getByLabelText(/buscar obras/i), "Casa");

    await waitFor(
      () => {
        const lastCall = vi.mocked(listProjects).mock.calls.at(-1)![0];
        expect(lastCall.search).toBe("Casa");
      },
      { timeout: 2000 }
    );
  });

  it("PL8: search also matches by Customer name (backend already supports it — client just forwards the term)", async () => {
    vi.mocked(listProjects).mockResolvedValue(page(["OBR-000001"]));
    const user = userEvent.setup();
    render(<ProjectList />);
    await screen.findAllByText("OBR-000001");

    await user.type(screen.getByLabelText(/buscar obras/i), "Fernanda");

    await waitFor(
      () => {
        const lastCall = vi.mocked(listProjects).mock.calls.at(-1)![0];
        expect(lastCall.search).toBe("Fernanda");
      },
      { timeout: 2000 }
    );
  });

  it("PL9: status filter buttons send the selected status param", async () => {
    vi.mocked(listProjects).mockResolvedValue(page(["OBR-000001"]));
    const user = userEvent.setup();
    render(<ProjectList />);
    await screen.findAllByText("OBR-000001");

    await user.click(screen.getByRole("button", { name: "Concluídas" }));

    await waitFor(() => {
      const lastCall = vi.mocked(listProjects).mock.calls.at(-1)![0];
      expect(lastCall.status).toBe("completed");
    });
  });

  it("PL10: uses server-side pagination (meta.current_page/last_page), never client-side slicing", async () => {
    vi.mocked(listProjects).mockResolvedValue(page(["OBR-000001"], 2, 5));
    render(<ProjectList />);
    await screen.findAllByText("OBR-000001");
    await screen.findByText("Página 2 de 5");
  });

  it("PL11: a late response for a superseded request is discarded", async () => {
    let resolveA!: (value: ProjectPaginationResponse) => void;
    const aPromise = new Promise<ProjectPaginationResponse>((resolve) => {
      resolveA = resolve;
    });
    vi.mocked(listProjects).mockReturnValueOnce(aPromise).mockResolvedValueOnce(page(["OBR-000002"]));

    const user = userEvent.setup();
    render(<ProjectList />);
    await user.type(screen.getByLabelText(/buscar obras/i), "x");

    await screen.findAllByText("OBR-000002");
    resolveA(page(["OBR-000001"]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryAllByText("OBR-000001").length).toBe(0);
  });

  it("PL12: switching company hides A's rows before B's response arrives (same render)", async () => {
    let resolveB!: (value: ProjectPaginationResponse) => void;
    const bPromise = new Promise<ProjectPaginationResponse>((resolve) => {
      resolveB = resolve;
    });
    vi.mocked(listProjects).mockResolvedValueOnce(page(["OBR-000001"])).mockReturnValueOnce(bPromise);

    const { rerender } = render(<ProjectList />);
    await screen.findAllByText("OBR-000001");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ProjectList />);

    expect(screen.queryAllByText("OBR-000001").length).toBe(0);

    resolveB(page(["OBR-000002"]));
    await screen.findAllByText("OBR-000002");
  });

  it("shows a distinct empty state (with CTA) when there are no Obras at all", async () => {
    vi.mocked(listProjects).mockResolvedValue(page([]));
    render(<ProjectList />);

    await screen.findByText("Nenhuma obra ainda");
    expect(screen.getByRole("button", { name: /nova obra/i })).toBeInTheDocument();
  });

  it("an error state offers a retry action", async () => {
    vi.mocked(listProjects).mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<ProjectList />);

    await screen.findByRole("alert");
    vi.mocked(listProjects).mockResolvedValueOnce(page(["OBR-000001"]));
    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));

    await screen.findAllByText("OBR-000001");
  });
});
