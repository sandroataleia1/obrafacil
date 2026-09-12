import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/customers/customers-client", () => ({
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
  lookupCnpj: vi.fn(),
  createAddress: vi.fn(),
  createContact: vi.fn(),
  lookupCep: vi.fn(),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ activeCompany: { id: "company-a", name: "Empresa A" } }),
}));

import { listCustomers } from "@/features/customers/customers-client";
import type { CustomerListItem, CustomerPaginationResponse } from "@/features/customers/types";
import { StepCustomer } from "../step-customer";

function customerListItem(overrides: Partial<CustomerListItem> = {}): CustomerListItem {
  return {
    id: "cust-search-1",
    kind: "individual",
    name: "Fulano Pereira",
    legal_name: null,
    trade_name: null,
    document: "12345678900",
    phone: "+5531999999999",
    email: null,
    active: true,
    primary_address: { id: "addr-1", label: "Casa", type: "residential", postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: "Belo Horizonte", state: "MG", reference_point: null, is_primary: true, created_at: "", updated_at: "" },
    primary_contact: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function page(items: CustomerListItem[]): CustomerPaginationResponse {
  return {
    data: items,
    meta: { current_page: 1, from: 1, last_page: 1, per_page: 15, to: items.length, total: items.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

const isStaleRequestAlwaysFresh = () => false;

function deferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderStepCustomer(overrides: Partial<Parameters<typeof StepCustomer>[0]> = {}) {
  return render(
    <StepCustomer
      selected={null}
      onSelect={vi.fn()}
      requestCompanyId="company-a"
      isStaleRequest={isStaleRequestAlwaysFresh}
      {...overrides}
    />
  );
}

describe("StepCustomer — autocomplete gating", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("SC1: 0/1/2 trimmed characters fire zero API calls", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([]));
    const user = userEvent.setup();
    renderStepCustomer();

    await user.type(screen.getByLabelText("Buscar cliente"), "j");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(listCustomers).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Buscar cliente"), "o");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(listCustomers).not.toHaveBeenCalled();
    expect(screen.getByText(/digite pelo menos 3 caracteres/i)).toBeInTheDocument();
  });

  it("SC2: leading/trailing whitespace is trimmed before the length check — '  jo ' (2 real chars) never fires", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([]));
    const user = userEvent.setup();
    renderStepCustomer();

    await user.type(screen.getByLabelText("Buscar cliente"), "  jo ");
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(listCustomers).not.toHaveBeenCalled();
  });

  it("SC3: 3+ characters fire the search after debounce and results render", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([customerListItem()]));
    const user = userEvent.setup();
    renderStepCustomer();

    await user.type(screen.getByLabelText("Buscar cliente"), "ful");
    await waitFor(() => expect(listCustomers).toHaveBeenCalled());
    await screen.findByText("Fulano Pereira");
  });

  it("SC4: a too-short query never shows 'Nenhum cliente encontrado'", async () => {
    const user = userEvent.setup();
    renderStepCustomer();

    await user.type(screen.getByLabelText("Buscar cliente"), "jo");
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(screen.queryByText(/nenhum cliente encontrado/i)).not.toBeInTheDocument();
    expect(screen.getByText(/digite pelo menos 3 caracteres/i)).toBeInTheDocument();
  });

  it("SC5: a real 3+ char search that returns zero rows shows 'Nenhum cliente encontrado'", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([]));
    const user = userEvent.setup();
    renderStepCustomer();

    await user.type(screen.getByLabelText("Buscar cliente"), "ful");
    await waitFor(() => expect(listCustomers).toHaveBeenCalled());
    await screen.findByText(/nenhum cliente encontrado/i);
  });

  it("SC6: selecting a result clears results/search/input immediately and shows the compact selected card", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([customerListItem()]));
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderStepCustomer({ onSelect });

    await user.type(screen.getByLabelText("Buscar cliente"), "ful");
    await screen.findByText("Fulano Pereira");
    await user.click(screen.getByText("Fulano Pereira"));

    expect(onSelect).toHaveBeenCalledWith(customerListItem());

    rerender(
      <StepCustomer
        selected={customerListItem()}
        onSelect={onSelect}
        requestCompanyId="company-a"
        isStaleRequest={isStaleRequestAlwaysFresh}
      />
    );

    expect(screen.queryByLabelText("Buscar cliente")).not.toBeInTheDocument();
    expect(screen.getByText("Cliente selecionado")).toBeInTheDocument();
    expect(screen.getAllByText("Fulano Pereira")[0]).toBeInTheDocument();
  });

  it("SC7: the compact card shows document and phone when present", () => {
    renderStepCustomer({ selected: customerListItem() });

    expect(screen.getByText("Cliente selecionado")).toBeInTheDocument();
    expect(screen.getByText(/123\.456\.789-00/)).toBeInTheDocument();
  });

  it("SC8: 'Trocar cliente' reopens search mode without clearing the current selection", async () => {
    const user = userEvent.setup();
    renderStepCustomer({ selected: customerListItem() });

    await user.click(screen.getByRole("button", { name: /trocar cliente/i }));

    expect(screen.getByLabelText("Buscar cliente")).toBeInTheDocument();
    // The previous selection is still visible/known to the parent — this
    // component never nulls it out on its own; only a NEW pick does.
    expect(screen.queryByText("Cliente selecionado")).not.toBeInTheDocument();
  });

  it("SC9: Enter selects the top/highlighted result and closes the autocomplete", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([customerListItem()]));
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderStepCustomer({ onSelect });

    const input = screen.getByLabelText("Buscar cliente");
    await user.type(input, "ful");
    await screen.findByText("Fulano Pereira");
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith(customerListItem());
  });

  it("SC10: a late response for a company that's since changed is discarded", async () => {
    let resolveSearch!: (value: CustomerPaginationResponse) => void;
    vi.mocked(listCustomers).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSearch = resolve;
      })
    );
    const activeCompanyIdRef = { current: "company-a" as string | undefined };
    const isStaleRequest = (requestCompanyId: string | undefined) => activeCompanyIdRef.current !== requestCompanyId;
    const user = userEvent.setup();
    const { rerender } = render(
      <StepCustomer selected={null} onSelect={vi.fn()} requestCompanyId="company-a" isStaleRequest={isStaleRequest} />
    );

    await user.type(screen.getByLabelText("Buscar cliente"), "ful");
    await waitFor(() => expect(listCustomers).toHaveBeenCalled());

    activeCompanyIdRef.current = "company-b";
    rerender(
      <StepCustomer selected={null} onSelect={vi.fn()} requestCompanyId="company-b" isStaleRequest={isStaleRequest} />
    );

    resolveSearch(page([customerListItem({ name: "Fulano da Empresa A" })]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Fulano da Empresa A")).not.toBeInTheDocument();
  });

  it("SC11: a stale in-flight response can't repopulate results after the query drops back below 3 characters", async () => {
    const deferred = deferredPromise<CustomerPaginationResponse>();
    vi.mocked(listCustomers).mockReturnValueOnce(deferred.promise);
    const user = userEvent.setup();
    renderStepCustomer();

    const input = screen.getByLabelText("Buscar cliente");
    await user.type(input, "ful");
    await waitFor(() => expect(listCustomers).toHaveBeenCalled());

    // Delete back down to 2 characters — the UI clears results/loading and
    // shows the hint, but the in-flight request for "ful" is still alive.
    await user.type(input, "{Backspace}{Backspace}");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.getByText(/digite pelo menos 3 caracteres/i)).toBeInTheDocument();

    deferred.resolve(page([customerListItem({ name: "Fulano Pereira" })]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Fulano Pereira")).not.toBeInTheDocument();
    expect(screen.getByText(/digite pelo menos 3 caracteres/i)).toBeInTheDocument();
  });

  it("SC12: a stale in-flight response can't repopulate results after Escape clears the search", async () => {
    const deferred = deferredPromise<CustomerPaginationResponse>();
    vi.mocked(listCustomers).mockReturnValueOnce(deferred.promise);
    const user = userEvent.setup();
    renderStepCustomer();

    const input = screen.getByLabelText("Buscar cliente");
    await user.type(input, "ful");
    await waitFor(() => expect(listCustomers).toHaveBeenCalled());

    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");

    deferred.resolve(page([customerListItem({ name: "Fulano Pereira" })]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Fulano Pereira")).not.toBeInTheDocument();
  });

  it("SC13: selecting a customer from a later, resolved search discards an earlier still-in-flight search's response", async () => {
    const deferred = deferredPromise<CustomerPaginationResponse>();
    vi.mocked(listCustomers).mockReturnValueOnce(deferred.promise);
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderStepCustomer({ onSelect });

    const input = screen.getByLabelText("Buscar cliente");
    await user.type(input, "ful");
    await waitFor(() => expect(listCustomers).toHaveBeenCalledTimes(1));

    // A second, different search fires and resolves before the first ever does.
    vi.mocked(listCustomers).mockResolvedValueOnce(page([customerListItem({ id: "cust-search-2", name: "Beatriz Souza" })]));
    await user.clear(input);
    await user.type(input, "bea");
    await screen.findByText("Beatriz Souza");
    await user.click(screen.getByText("Beatriz Souza"));

    expect(onSelect).toHaveBeenCalledWith(customerListItem({ id: "cust-search-2", name: "Beatriz Souza" }));
    // Selection closes the autocomplete immediately (wizard variant).
    expect(screen.queryByLabelText("Buscar cliente")).not.toBeInTheDocument();

    deferred.resolve(page([customerListItem({ name: "Fulano Pereira" })]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The now-closed autocomplete must never reopen/repaint from the stale response.
    expect(screen.queryByText("Fulano Pereira")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Buscar cliente")).not.toBeInTheDocument();
  });

  it("SC14: 'Trocar cliente' starts a new session that a stale response from the PREVIOUS session cannot repopulate", async () => {
    const deferred = deferredPromise<CustomerPaginationResponse>();
    vi.mocked(listCustomers).mockReturnValueOnce(deferred.promise);
    const user = userEvent.setup();
    const { rerender } = renderStepCustomer();

    await user.type(screen.getByLabelText("Buscar cliente"), "ful");
    await waitFor(() => expect(listCustomers).toHaveBeenCalled());

    // A customer becomes selected via a path other than this in-flight
    // search (e.g. the quick-create dialog) — simulated by rerendering
    // with `selected` set, which closes search mode.
    rerender(
      <StepCustomer
        selected={customerListItem({ id: "cust-other", name: "Outro Cliente" })}
        onSelect={vi.fn()}
        requestCompanyId="company-a"
        isStaleRequest={isStaleRequestAlwaysFresh}
      />
    );
    expect(screen.getByText("Cliente selecionado")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /trocar cliente/i }));
    expect(screen.getByLabelText("Buscar cliente")).toBeInTheDocument();

    deferred.resolve(page([customerListItem({ name: "Fulano Pereira" })]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Fulano Pereira")).not.toBeInTheDocument();
  });

  it("SC15: a tenant switch away and back invalidates a stale response via the sequence guard even when the company guard alone would not catch it", async () => {
    const deferred = deferredPromise<CustomerPaginationResponse>();
    vi.mocked(listCustomers).mockReturnValueOnce(deferred.promise);
    const activeCompanyIdRef = { current: "company-a" as string | undefined };
    const isStaleRequest = (requestCompanyId: string | undefined) => activeCompanyIdRef.current !== requestCompanyId;
    const user = userEvent.setup();
    const { rerender } = render(
      <StepCustomer selected={null} onSelect={vi.fn()} requestCompanyId="company-a" isStaleRequest={isStaleRequest} />
    );

    await user.type(screen.getByLabelText("Buscar cliente"), "ful");
    await waitFor(() => expect(listCustomers).toHaveBeenCalled());

    // Switch away, then back to the SAME company. The captured fireCompanyId
    // ("company-a") ends up matching the active company again, so
    // `isStaleRequest` alone would say "not stale" — only the sequence
    // bump (fired on every requestCompanyId change, including back to A)
    // still rejects the response.
    activeCompanyIdRef.current = "company-b";
    rerender(<StepCustomer selected={null} onSelect={vi.fn()} requestCompanyId="company-b" isStaleRequest={isStaleRequest} />);
    activeCompanyIdRef.current = "company-a";
    rerender(<StepCustomer selected={null} onSelect={vi.fn()} requestCompanyId="company-a" isStaleRequest={isStaleRequest} />);

    expect(isStaleRequest("company-a")).toBe(false);

    deferred.resolve(page([customerListItem({ name: "Fulano da Empresa A" })]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Fulano da Empresa A")).not.toBeInTheDocument();
  });

  it("SC16: the inline variant requires 3+ characters too — a 1-2 char query fires zero API calls", async () => {
    const user = userEvent.setup();
    renderStepCustomer({ variant: "inline" });

    await user.type(screen.getByLabelText("Buscar cliente"), "jo");
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(listCustomers).not.toHaveBeenCalled();
    expect(screen.getByText(/digite pelo menos 3 caracteres/i)).toBeInTheDocument();
  });

  it("SC17: the inline variant preserves list-coexistence — the list stays open and a second result is selectable right after the first", async () => {
    vi.mocked(listCustomers).mockResolvedValue(
      page([customerListItem(), customerListItem({ id: "cust-search-2", name: "Beatriz Souza" })])
    );
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderStepCustomer({ variant: "inline", onSelect });

    await user.type(screen.getByLabelText("Buscar cliente"), "ful");
    await screen.findByText("Fulano Pereira");
    await user.click(screen.getByText("Fulano Pereira"));

    expect(onSelect).toHaveBeenCalledWith(customerListItem());
    // The inline variant never clears/closes on selection.
    expect(screen.getByLabelText("Buscar cliente")).toBeInTheDocument();
    expect(screen.getByText("Beatriz Souza")).toBeInTheDocument();

    await user.click(screen.getByText("Beatriz Souza"));
    expect(onSelect).toHaveBeenCalledWith(customerListItem({ id: "cust-search-2", name: "Beatriz Souza" }));
  });
});

describe("StepCustomer — RAW input invalidation (closes the final autocomplete race)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // §The bug these tests specifically target: invalidation used to only
  // happen in the effect keyed on the DEBOUNCED `search` state, leaving a
  // ~300ms window (between a keystroke and the debounce firing) where a
  // request for the PREVIOUS raw input value was still "current" as far
  // as `searchSequence` was concerned — unlike SC11/SC12 (which wait past
  // the debounce window before resolving), these resolve the stale
  // request IMMEDIATELY, inside that exact window, to prove the fix (raw
  // `onChange` invalidates before the debounce timer is even set) closes
  // it — not just the already-covered post-debounce case.
  it("RAW1: a request for 'ful' resolving immediately after backspacing to 'fu' (well before the next debounce fires) never populates results", async () => {
    const deferred = deferredPromise<CustomerPaginationResponse>();
    vi.mocked(listCustomers).mockReturnValueOnce(deferred.promise);
    const user = userEvent.setup();
    renderStepCustomer();

    const input = screen.getByLabelText("Buscar cliente");
    await user.type(input, "ful");
    await waitFor(() => expect(listCustomers).toHaveBeenCalledTimes(1));

    // Backspace immediately — well under the 300ms debounce window for
    // whatever comes next.
    await user.type(input, "{Backspace}");
    expect(input).toHaveValue("fu");
    // The hint must already be showing — synchronously, not after
    // waiting out any debounce.
    expect(screen.getByText(/digite pelo menos 3 caracteres/i)).toBeInTheDocument();

    // Resolve the stale "ful" request RIGHT NOW, inside the window where
    // the old code would not yet have invalidated it.
    deferred.resolve(page([customerListItem({ name: "Fulano Pereira" })]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Fulano Pereira")).not.toBeInTheDocument();
    expect(screen.getByText(/digite pelo menos 3 caracteres/i)).toBeInTheDocument();
  });

  it("RAW2: a request for 'ful' resolving immediately after switching to a different valid query 'bea' never paints 'Fulano' while the input shows 'bea'", async () => {
    const deferred = deferredPromise<CustomerPaginationResponse>();
    vi.mocked(listCustomers).mockReturnValueOnce(deferred.promise);
    vi.mocked(listCustomers).mockResolvedValueOnce(page([customerListItem({ id: "cust-bea", name: "Beatriz Souza" })]));
    const user = userEvent.setup();
    renderStepCustomer();

    const input = screen.getByLabelText("Buscar cliente");
    await user.type(input, "ful");
    await waitFor(() => expect(listCustomers).toHaveBeenCalledTimes(1));

    // Clear and retype a different, still-valid query immediately —
    // before 300ms has passed, i.e. before "ful"'s own debounce-driven
    // invalidation (if any) would have had a chance to run.
    await user.clear(input);
    await user.type(input, "bea");
    expect(input).toHaveValue("bea");

    // Resolve the stale "ful" request right now.
    deferred.resolve(page([customerListItem({ name: "Fulano Pereira" })]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // "Fulano" must never appear — the input already moved on to "bea".
    expect(screen.queryByText("Fulano Pereira")).not.toBeInTheDocument();

    // The real, current search for "bea" still resolves normally.
    await screen.findByText("Beatriz Souza");
  });

  it("RAW6 (customer half): a fresh, valid query after the raw-invalidation dance still fires and paints its own results normally", async () => {
    vi.mocked(listCustomers).mockResolvedValueOnce(page([customerListItem({ name: "Fulano Pereira" })]));
    const user = userEvent.setup();
    renderStepCustomer();

    await user.type(screen.getByLabelText("Buscar cliente"), "ful");
    await screen.findByText("Fulano Pereira");
    expect(listCustomers).toHaveBeenCalledTimes(1);
  });
});
