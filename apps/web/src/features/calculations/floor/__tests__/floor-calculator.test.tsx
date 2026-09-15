import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FloorCalculator } from "../floor-calculator";
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
  await user.click(screen.getByRole("button", { name: "Adicionar ambiente" }));
  await user.type(screen.getByLabelText("Comprimento"), "5");
  await user.type(screen.getByLabelText("Largura"), "4");
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));

  await user.type(screen.getByLabelText("Cobertura por caixa"), "2");
  await user.click(screen.getByRole("button", { name: "Continuar" }));

  await user.click(screen.getByRole("button", { name: "Ver resultado" }));
}

describe("FloorCalculator — CV2 (FRONTEND-BUDGETS-01A1 §16-18)", () => {
  it("CV2: added=true under Company A, then resets to false on switching to Company B", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<FloorCalculator />);

    await reachResult(user);
    await user.click(screen.getByRole("button", { name: "Adicionar ao orçamento" }));
    expect(screen.getByText("Resultado adicionado ao orçamento")).toBeInTheDocument();

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<FloorCalculator />);

    expect(screen.queryByText("Resultado adicionado ao orçamento")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar ao orçamento" })).toBeInTheDocument();
  });
});
