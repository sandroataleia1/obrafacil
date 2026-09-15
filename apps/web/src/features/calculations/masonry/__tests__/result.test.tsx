import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultStep } from "../result";
import type { MasonryMaterial } from "@/mocks/calculations/masonry";
import type { MasonryCalculationResult } from "../prototype-calculator";
import { clearPendingBudgetItem } from "@/features/budgets/prototype/pending-budget-item";

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

const MATERIAL: MasonryMaterial = {
  id: "tijolo-9x14x29",
  name: "Tijolo cerâmico",
  dimensions: "9 × 14 × 29 cm",
  unitsPerSquareMeter: 33.33,
  resultLabel: "Tijolos",
};

const RESULT: MasonryCalculationResult = {
  grossAreaM2: 22,
  openingsAreaM2: 2,
  netAreaM2: 20,
  wastePercentage: 10,
  unitsBeforeWaste: 600,
  units: 660,
  auxiliary: { mortarM3: 1.2, cementBags: 5, limeBags: 2, sandM3: 1 },
};

beforeEach(() => {
  authState.activeCompany = { id: "company-a", name: "Empresa A" };
  clearPendingBudgetItem("company-a");
  clearPendingBudgetItem("company-b");
});

describe("ResultStep (masonry) — CV1 (FRONTEND-BUDGETS-01A1 §16-18)", () => {
  it("CV1: added=true under Company A, then resets to false on switching to Company B", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ResultStep material={MATERIAL} result={RESULT} onNewCalculation={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Adicionar ao orçamento" }));
    expect(screen.getByText("Resultado adicionado ao orçamento")).toBeInTheDocument();

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ResultStep material={MATERIAL} result={RESULT} onNewCalculation={vi.fn()} />);

    expect(screen.queryByText("Resultado adicionado ao orçamento")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar ao orçamento" })).toBeInTheDocument();
    // The technical calculation result itself is untouched.
    expect(screen.getByText("660")).toBeInTheDocument();
  });

  it("CV1b: clicking again under Company B writes B's OWN handoff, never copies A's", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ResultStep material={MATERIAL} result={RESULT} onNewCalculation={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Adicionar ao orçamento" }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ResultStep material={MATERIAL} result={RESULT} onNewCalculation={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Adicionar ao orçamento" }));
    expect(screen.getByText("Resultado adicionado ao orçamento")).toBeInTheDocument();

    const raw = window.sessionStorage.getItem("obrafacil:pending-budget-item:company-b");
    expect(raw).not.toBeNull();
  });
});
