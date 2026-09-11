import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
);

vi.mock("@/features/customers/customers-client", () => ({
  createAddress: vi.fn(),
  createContact: vi.fn(),
  lookupCep: vi.fn(),
}));

import { createAddress, createContact } from "@/features/customers/customers-client";
import { QuickAddressDialog } from "../quick-address-dialog";
import { QuickContactDialog } from "../quick-contact-dialog";

describe("QuickAddressDialog", () => {
  it("A1: POSTs to the canonical /customers/{customer}/addresses endpoint via createAddress", async () => {
    vi.mocked(createAddress).mockResolvedValue({ id: "addr-1", label: "Obra" } as never);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<QuickAddressDialog open onOpenChange={() => {}} customerId="cust-1" onCreated={onCreated} />);

    await user.type(screen.getByLabelText(/identificação do endereço/i), "Obra");
    await user.click(screen.getByRole("button", { name: /criar endereço/i }));

    await waitFor(() => expect(createAddress).toHaveBeenCalledWith("cust-1", expect.objectContaining({ label: "Obra" })));
  });

  it("A2: never sends is_primary — the wizard selects it regardless of primary status", async () => {
    vi.mocked(createAddress).mockResolvedValue({ id: "addr-1", label: "Obra" } as never);
    const user = userEvent.setup();
    render(<QuickAddressDialog open onOpenChange={() => {}} customerId="cust-1" onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText(/identificação do endereço/i), "Obra");
    await user.click(screen.getByRole("button", { name: /criar endereço/i }));

    await waitFor(() => expect(createAddress).toHaveBeenCalled());
    expect(vi.mocked(createAddress).mock.calls[0]![1]).not.toHaveProperty("is_primary");
  });

  it("A3: calls onCreated with the created address", async () => {
    const created = { id: "addr-1", label: "Obra" };
    vi.mocked(createAddress).mockResolvedValue(created as never);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<QuickAddressDialog open onOpenChange={() => {}} customerId="cust-1" onCreated={onCreated} />);

    await user.type(screen.getByLabelText(/identificação do endereço/i), "Obra");
    await user.click(screen.getByRole("button", { name: /criar endereço/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
  });

  it("A4: the submit button is disabled until a label is entered", () => {
    render(<QuickAddressDialog open onOpenChange={() => {}} customerId="cust-1" onCreated={vi.fn()} />);
    expect(screen.getByRole("button", { name: /criar endereço/i })).toBeDisabled();
  });

  it("A5: shows a generic error on an unexpected failure", async () => {
    vi.mocked(createAddress).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<QuickAddressDialog open onOpenChange={() => {}} customerId="cust-1" onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText(/identificação do endereço/i), "Obra");
    await user.click(screen.getByRole("button", { name: /criar endereço/i }));

    await waitFor(() => expect(screen.getByText(/não foi possível criar o endereço/i)).toBeInTheDocument());
  });
});

describe("QuickContactDialog", () => {
  it("CT1: POSTs to the canonical /customers/{customer}/contacts endpoint via createContact", async () => {
    vi.mocked(createContact).mockResolvedValue({ id: "contact-1", name: "Maria" } as never);
    const user = userEvent.setup();
    render(<QuickContactDialog open onOpenChange={() => {}} customerId="cust-1" isFirstContact={false} onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome"), "Maria");
    await user.click(screen.getByRole("button", { name: /criar contato/i }));

    await waitFor(() => expect(createContact).toHaveBeenCalledWith("cust-1", expect.objectContaining({ name: "Maria" })));
  });

  it("CT2: always sends active: true — no toggle is shown", async () => {
    vi.mocked(createContact).mockResolvedValue({ id: "contact-1", name: "Maria" } as never);
    const user = userEvent.setup();
    render(<QuickContactDialog open onOpenChange={() => {}} customerId="cust-1" isFirstContact={false} onCreated={vi.fn()} />);

    expect(screen.queryByText(/ativo/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Nome"), "Maria");
    await user.click(screen.getByRole("button", { name: /criar contato/i }));

    await waitFor(() => expect(createContact).toHaveBeenCalled());
    expect(vi.mocked(createContact).mock.calls[0]![1].active).toBe(true);
  });

  it("CT3: sends is_primary: true only when this is the customer's first contact", async () => {
    vi.mocked(createContact).mockResolvedValue({ id: "contact-1", name: "Maria" } as never);
    const user = userEvent.setup();
    render(<QuickContactDialog open onOpenChange={() => {}} customerId="cust-1" isFirstContact onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome"), "Maria");
    await user.click(screen.getByRole("button", { name: /criar contato/i }));

    await waitFor(() => expect(createContact).toHaveBeenCalled());
    expect(vi.mocked(createContact).mock.calls[0]![1].is_primary).toBe(true);
  });

  it("CT4: sends is_primary: false when the customer already has contacts", async () => {
    vi.mocked(createContact).mockResolvedValue({ id: "contact-2", name: "Pedro" } as never);
    const user = userEvent.setup();
    render(<QuickContactDialog open onOpenChange={() => {}} customerId="cust-1" isFirstContact={false} onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome"), "Pedro");
    await user.click(screen.getByRole("button", { name: /criar contato/i }));

    await waitFor(() => expect(createContact).toHaveBeenCalled());
    expect(vi.mocked(createContact).mock.calls[0]![1].is_primary).toBe(false);
  });

  it("CT5: the submit button is disabled until a name is entered", () => {
    render(<QuickContactDialog open onOpenChange={() => {}} customerId="cust-1" isFirstContact={false} onCreated={vi.fn()} />);
    expect(screen.getByRole("button", { name: /criar contato/i })).toBeDisabled();
  });
});
