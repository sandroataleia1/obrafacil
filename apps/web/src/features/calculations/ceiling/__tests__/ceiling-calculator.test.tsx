import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CeilingCalculator } from "../ceiling-calculator";
import { clearPendingBudgetItem } from "@/features/budgets/prototype/pending-budget-item";

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

beforeEach(() => {
  authState.activeCompany = { id: "company-a", name: "Empresa A" };
  clearPendingBudgetItem("company-a");
  clearPendingBudgetItem("company-b");
});

async function reachResult(user: ReturnType<typeof userEvent.setup>) {
  // A square room (3x3) avoids the "direction" radiogroup — only a
  // single, always-viable "length" yield applies.
  await user.click(screen.getByRole("button", { name: "Adicionar cômodo" }));
  await user.type(screen.getByLabelText("Comprimento"), "3");
  await user.type(screen.getByLabelText("Largura"), "3");
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));

  // Pick a panel length for the room (radiogroup with options like "3 m").
  await user.click(screen.getByRole("radio", { name: "3 m" }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));

  await user.click(screen.getByRole("button", { name: "Ver resultado" }));
}

describe("CeilingCalculator — CV4 (FRONTEND-BUDGETS-01A1 §16-18)", () => {
  it("CV4: added=true under Company A, then resets to false on switching to Company B", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CeilingCalculator />);

    await reachResult(user);
    await user.click(screen.getByRole("button", { name: "Adicionar ao orçamento" }));
    expect(screen.getByText("Resultado adicionado ao orçamento")).toBeInTheDocument();

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<CeilingCalculator />);

    expect(screen.queryByText("Resultado adicionado ao orçamento")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar ao orçamento" })).toBeInTheDocument();
  });
});
