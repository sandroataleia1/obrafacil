import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CustomerList } from "../customer-list";
import type { CustomerListItem, CustomerPaginationResponse } from "../types";

const refresh = vi.fn();
const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ ...authState, refresh }),
}));

vi.mock("@/features/budgets/prototype/budget-store", () => ({
  listAllBudgets: () => [],
}));

vi.mock("@/features/projects/prototype/project-store", () => ({
  listAllProjects: () => [],
}));

vi.mock("../customers-client", () => ({
  listCustomers: vi.fn(),
  deleteCustomer: vi.fn(),
}));

import { deleteCustomer, listCustomers } from "../customers-client";

// The list renders both a mobile card list and a desktop table simultaneously
// (CSS-only responsive hiding), so any given customer's name always appears
// twice in the DOM — these helpers treat that as "present"/"absent" instead
// of tripping Testing Library's single-match strictness.
async function findCustomer(name: string) {
  return screen.findAllByText(name);
}
function customerCount(name: string) {
  return screen.queryAllByText(name).length;
}

function item(name: string): CustomerListItem {
  return {
    id: `id-${name}`,
    kind: "individual",
    name,
    legal_name: null,
    trade_name: null,
    document: null,
    phone: null,
    email: null,
    active: true,
    primary_address: null,
    primary_contact: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
}

function page(names: string[], currentPage = 1, lastPage = 1): CustomerPaginationResponse {
  return {
    data: names.map(item),
    meta: { current_page: currentPage, from: 1, last_page: lastPage, per_page: 15, to: names.length, total: names.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

describe("CustomerList — tenant isolation (TF1-TF7)", () => {
  beforeEach(() => {
    vi.mocked(listCustomers).mockReset();
    vi.mocked(deleteCustomer).mockReset();
    refresh.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** TF1: List renders Company A's customers. */
  it("TF1: renders Company A's customers", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page(["Cliente A1", "Cliente A2"]));
    render(<CustomerList />);

    await findCustomer("Cliente A1");
    expect(customerCount("Cliente A2")).toBeGreaterThan(0);
  });

  /** TF2/TF3: switching to Company B hides A's rows before B's response arrives — no frame with stale data. */
  it("TF2/TF3: switching company hides A's customers immediately, before B responds", async () => {
    let resolveB!: (value: CustomerPaginationResponse) => void;
    const bPromise = new Promise<CustomerPaginationResponse>((resolve) => {
      resolveB = resolve;
    });
    vi.mocked(listCustomers).mockResolvedValueOnce(page(["Cliente A1"])).mockReturnValueOnce(bPromise);

    const { rerender } = render(<CustomerList />);
    await findCustomer("Cliente A1");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerList />);

    // TF3: no Company A data visible while B's request is still in flight.
    expect(customerCount("Cliente A1")).toBe(0);
    expect(screen.getByRole("status")).toBeInTheDocument();

    resolveB(page(["Cliente B1"]));
    // TF4: once B responds, only B's data is shown.
    await findCustomer("Cliente B1");
    expect(customerCount("Cliente A1")).toBe(0);
  });

  /** TF5: a late response from the old tenant (A) never reappears after B's data is already applied. */
  it("TF5: a late response from Company A never reappears after Company B loaded", async () => {
    let resolveA!: (value: CustomerPaginationResponse) => void;
    const aPromise = new Promise<CustomerPaginationResponse>((resolve) => {
      resolveA = resolve;
    });
    vi.mocked(listCustomers).mockReturnValueOnce(aPromise).mockResolvedValueOnce(page(["Cliente B1"]));

    const { rerender } = render(<CustomerList />);
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerList />);

    await findCustomer("Cliente B1");

    resolveA(page(["Cliente A1"]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(customerCount("Cliente B1")).toBeGreaterThan(0);
    expect(customerCount("Cliente A1")).toBe(0);
  });

  /** TF6: switching company resets the page back to 1, even if A was on a later page. */
  it("TF6: switching company resets page to 1", async () => {
    vi.mocked(listCustomers)
      .mockResolvedValueOnce(page(["Cliente A1"], 5, 5))
      .mockResolvedValueOnce(page(["Cliente B1"], 1, 1));

    const { rerender } = render(<CustomerList />);
    await findCustomer("Cliente A1");
    await screen.findByText("Página 5 de 5");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerList />);

    await findCustomer("Cliente B1");

    const secondCall = vi.mocked(listCustomers).mock.calls[1]![0];
    expect(secondCall.page).toBe(1);
  });

  /** TF7: delete confirmation for a Company A customer closes automatically on tenant switch. */
  it("TF7: the delete dialog for a Company A customer closes when switching to Company B", async () => {
    vi.mocked(listCustomers).mockResolvedValueOnce(page(["Cliente A1"])).mockResolvedValueOnce(page(["Cliente B1"]));

    const user = userEvent.setup();
    const { rerender } = render(<CustomerList />);
    await findCustomer("Cliente A1");

    await user.click(screen.getAllByRole("button", { name: "Excluir Cliente A1" })[0]!);
    await screen.findByText('Excluir o cliente "Cliente A1"? Esta ação não pode ser desfeita.');

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CustomerList />);

    await waitFor(() =>
      expect(screen.queryByText('Excluir o cliente "Cliente A1"? Esta ação não pode ser desfeita.')).not.toBeInTheDocument()
    );
  });
});
