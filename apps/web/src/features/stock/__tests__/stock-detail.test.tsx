import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const positionState: { position: unknown; error: boolean } = { position: undefined, error: false };
const reload = vi.fn();
vi.mock("../use-stock-position", () => ({
  useStockPosition: () => ({ position: positionState.position, error: positionState.error, reload }),
}));

const movementsState: { response: unknown; error: boolean } = { response: undefined, error: false };
const reloadMovements = vi.fn();
vi.mock("../use-stock-movements", () => ({
  useStockMovements: () => ({ response: movementsState.response, error: movementsState.error, reload: reloadMovements }),
}));

vi.mock("../stock-client", () => ({
  deleteMaterialConsumption: vi.fn(),
}));

import { deleteMaterialConsumption } from "../stock-client";
import { StockDetail } from "../stock-detail";
import type { StockMovement, StockMovementPaginationResponse, StockPosition } from "../types";

function position(overrides: Partial<StockPosition> = {}): StockPosition {
  return {
    project: { id: "proj-1", number: "OBR-000001", name: "Casa Oliveira" },
    material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: null,
    purchased_quantity: "0.000",
    received_quantity: "0.000",
    consumed_quantity: "0.000",
    stock_quantity: "0.000",
    pending_receipt_quantity: "0.000",
    missing_to_purchase_quantity: null,
    total_in: "0.000",
    total_out: "0.000",
    ...overrides,
  };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: "consumption:c1",
    project_id: "proj-1",
    material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    type: "OUT",
    quantity: "2.000",
    occurred_at: "2026-09-20",
    source_type: "CONSUMPTION",
    source_id: "c1",
    note: null,
    ...overrides,
  };
}

function movementsPage(data: StockMovement[]): StockMovementPaginationResponse {
  return {
    data,
    meta: { current_page: 1, from: 1, last_page: 1, per_page: 30, to: data.length, total: data.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

/**
 * SUPPLY-FRONTEND-01D §20-26 (SD1-SD16). StockDetail is fully API-driven
 * — `position === null` means a REAL 404 (foreign/nonexistent pair),
 * never a valid same-tenant pair with zero physical history (which is a
 * normal zero-valued position, not null). Delete only offered for
 * CONSUMPTION movements, using `movement.source_id`.
 */
describe("StockDetail — SUPPLY-FRONTEND-01D §20-26 (SD1-SD16)", () => {
  beforeEach(() => {
    reload.mockReset();
    reloadMovements.mockReset();
    vi.mocked(deleteMaterialConsumption).mockReset();
    positionState.position = undefined;
    positionState.error = false;
    movementsState.response = undefined;
    movementsState.error = false;
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("SD1: an operational position error shows a retry message", async () => {
    positionState.error = true;
    render(<StockDetail projectId="proj-1" materialId="mat-1" />);
    expect(await screen.findByText(/não foi possível carregar o estoque agora/i)).toBeInTheDocument();
  });

  it("SD2: position === null (real 404) shows the not-found EmptyState", async () => {
    positionState.position = null;
    render(<StockDetail projectId="proj-1" materialId="mat-1" />);
    expect(await screen.findByText(/estoque não encontrado/i)).toBeInTheDocument();
  });

  it("SD3: a valid pair with zero physical history renders normally with zero-valued metrics, never a 404", async () => {
    positionState.position = position();
    movementsState.response = movementsPage([]);
    render(<StockDetail projectId="proj-1" materialId="mat-1" />);
    expect((await screen.findAllByText("Cimento")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/estoque não encontrado/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/nenhuma movimentação registrada ainda/i)).toBeInTheDocument();
  });

  it("SD4: a GOODS_RECEIPT movement shows a label only, no link, no delete button", async () => {
    positionState.position = position();
    movementsState.response = movementsPage([
      movement({ id: "goods-receipt-item:1", source_type: "GOODS_RECEIPT", source_id: "gr-1", type: "IN" }),
    ]);
    render(<StockDetail projectId="proj-1" materialId="mat-1" />);
    expect(await screen.findByText("Recebimento de compra")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /excluir consumo/i })).not.toBeInTheDocument();
  });

  it("SD5: a MANUAL_ADJUSTMENT movement shows a label only, no delete button", async () => {
    positionState.position = position();
    movementsState.response = movementsPage([
      movement({ id: "adjustment:1", source_type: "MANUAL_ADJUSTMENT", source_id: "adj-1", type: "ADJUSTMENT_IN" }),
    ]);
    render(<StockDetail projectId="proj-1" materialId="mat-1" />);
    expect(await screen.findByText("Ajuste manual")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /excluir consumo/i })).not.toBeInTheDocument();
  });

  it("SD6: a CONSUMPTION movement offers delete, calling deleteMaterialConsumption with movement.source_id (never movement.id)", async () => {
    positionState.position = position();
    movementsState.response = movementsPage([movement({ id: "consumption:c1", source_id: "c1" })]);
    vi.mocked(deleteMaterialConsumption).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<StockDetail projectId="proj-1" materialId="mat-1" />);

    await user.click(await screen.findByRole("button", { name: /excluir consumo/i }));

    await waitFor(() => expect(deleteMaterialConsumption).toHaveBeenCalledWith("proj-1", "c1"));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadMovements).toHaveBeenCalledTimes(1);
  });

  it("SD7: a failed delete shows a controlled error, never reloads", async () => {
    positionState.position = position();
    movementsState.response = movementsPage([movement()]);
    vi.mocked(deleteMaterialConsumption).mockRejectedValue(new Error("500"));
    const user = userEvent.setup();
    render(<StockDetail projectId="proj-1" materialId="mat-1" />);

    await user.click(await screen.findByRole("button", { name: /excluir consumo/i }));

    expect(await screen.findByText(/não foi possível excluir este consumo agora/i)).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it("SD8: a movements-only error shows its own retry, independent of a successful position load", async () => {
    positionState.position = position();
    movementsState.error = true;
    render(<StockDetail projectId="proj-1" materialId="mat-1" />);
    expect((await screen.findAllByText("Cimento")).length).toBeGreaterThan(0);
    expect(await screen.findByText(/não foi possível carregar as movimentações agora/i)).toBeInTheDocument();
  });

  it("SD9: required_quantity === null renders 'Não definido', never '0'", async () => {
    positionState.position = position({ required_quantity: null });
    movementsState.response = movementsPage([]);
    render(<StockDetail projectId="proj-1" materialId="mat-1" />);
    expect(await screen.findByText("Não definido")).toBeInTheDocument();
  });
});
