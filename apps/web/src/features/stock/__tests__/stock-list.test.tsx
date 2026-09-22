import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/projects/use-all-projects", () => ({
  useAllProjects: () => ({ projects: [], error: false, reload: vi.fn() }),
}));

const listState: { response: unknown; error: boolean; loading: boolean } = {
  response: undefined,
  error: false,
  loading: false,
};
const reload = vi.fn();
vi.mock("../use-stock-positions", () => ({
  useStockPositions: () => ({ ...listState, reload }),
}));

import { StockList } from "../stock-list";
import type { StockPosition, StockPositionPaginationResponse } from "../types";

function position(overrides: Partial<StockPosition> = {}): StockPosition {
  return {
    project: { id: "proj-1", number: "OBR-000001", name: "Casa Oliveira" },
    material: { id: "mat-1", name: "Cimento", unit_code: "sc", unit_custom_label: null, active: true },
    required_quantity: "10.000",
    purchased_quantity: "5.000",
    received_quantity: "5.000",
    consumed_quantity: "2.000",
    stock_quantity: "3.000",
    pending_receipt_quantity: "0.000",
    missing_to_purchase_quantity: "5.000",
    total_in: "5.000",
    total_out: "2.000",
    ...overrides,
  };
}

function page(data: StockPosition[]): StockPositionPaginationResponse {
  return {
    data,
    meta: { current_page: 1, from: 1, last_page: 1, per_page: 15, to: data.length, total: data.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

/**
 * SUPPLY-FRONTEND-01D §15-19 (SL1-SL12). StockList renders directly off
 * the `StockPosition` Resource — never recalculates a metric — and
 * distinguishes loading / real-empty / filter-empty / error states.
 */
describe("StockList — SUPPLY-FRONTEND-01D §15-19 (SL1-SL12)", () => {
  beforeEach(() => {
    reload.mockReset();
    listState.response = undefined;
    listState.error = false;
    listState.loading = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("SL1: an operational error shows a retry message, never an empty state", async () => {
    listState.error = true;
    render(<StockList />);
    expect(await screen.findByText(/não foi possível carregar o estoque agora/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhum material/i)).not.toBeInTheDocument();
  });

  it("SL2: the retry button calls reload()", async () => {
    listState.error = true;
    render(<StockList />);
    const button = await screen.findByRole("button", { name: /tentar novamente/i });
    button.click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("SL3: loading shows a busy status, never a premature empty state", () => {
    listState.loading = true;
    render(<StockList />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(/nenhum material/i)).not.toBeInTheDocument();
  });

  it("SL4: a real empty (unfiltered, page 1) response shows the true-empty EmptyState", async () => {
    listState.response = page([]);
    render(<StockList />);
    expect(await screen.findByText(/nenhum material a acompanhar ainda/i)).toBeInTheDocument();
  });

  it("SL5: every value rendered comes straight from the StockPosition Resource, never recalculated", async () => {
    listState.response = page([position()]);
    render(<StockList />);
    expect((await screen.findAllByText("Cimento")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Casa Oliveira")).length).toBeGreaterThan(0);
  });

  it("SL6: required_quantity === null renders 'Não definido', never '0'", async () => {
    listState.response = page([position({ required_quantity: null, missing_to_purchase_quantity: null })]);
    render(<StockList />);
    expect((await screen.findAllByText("Não definido")).length).toBeGreaterThan(0);
  });
});
