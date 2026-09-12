import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

// jsdom doesn't implement `scrollIntoView` at all — `StepSchedule`'s
// submit-error-focus effect calls it on the alert element whenever a
// submit error appears; polyfill it here the same way a per-file browser-
// API mock (e.g. `matchMedia`) is already done elsewhere in this suite.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

import { computeOrderPreview } from "../../money-preview";
import { StepSchedule } from "../step-schedule";

/** Minimal required props for `StepSchedule`, overridable per test. */
function renderStepSchedule(overrides: Partial<Parameters<typeof StepSchedule>[0]> = {}) {
  const preview = computeOrderPreview({
    items: [{ quantity: "1.000", unitPrice: "100.00" }],
    orderDiscount: "0.00",
    travelFee: "20.00",
  });

  return render(
    <StepSchedule
      title="Atendimento"
      onTitleChange={vi.fn()}
      description=""
      onDescriptionChange={vi.fn()}
      scheduledStart=""
      onScheduledStartChange={vi.fn()}
      scheduledEnd=""
      onScheduledEndChange={vi.fn()}
      scheduleError={null}
      travelFeeInput="20,00"
      onTravelFeeChange={vi.fn()}
      travelFeeSettingsStatus="success"
      onRetryTravelFeeSettings={vi.fn()}
      orderDiscountInput="0,00"
      onOrderDiscountChange={vi.fn()}
      orderDiscountError={null}
      notes=""
      onNotesChange={vi.fn()}
      customerName="Cliente Teste"
      addressLabel="Endereço principal"
      contactName={null}
      preview={preview}
      itemSummaries={[]}
      titleError={null}
      orderDiscountDecimal="0.00"
      travelFeeDecimal="20.00"
      {...overrides}
    />
  );
}

describe("StepSchedule — Total line reflects travel-fee-settings status (bug #3)", () => {
  it("FS1: while travelFeeSettingsStatus is 'loading', the Total line shows a loading placeholder, not a monetary value", () => {
    renderStepSchedule({ travelFeeSettingsStatus: "loading" });

    expect(screen.getByText("Calculando...")).toBeInTheDocument();
    expect(screen.queryByText("R$ 120,00")).not.toBeInTheDocument();
  });

  it("FS2: while travelFeeSettingsStatus is 'error', the Total line shows an unavailable placeholder, not a value computed from a zero/placeholder travel fee", () => {
    renderStepSchedule({ travelFeeSettingsStatus: "error" });

    expect(screen.getByText("Total indisponível")).toBeInTheDocument();
    // The would-be total computed from `preview.total` (subtotal + the
    // still-loading/unknown travel fee) must never appear as the Total.
    expect(screen.queryByText("R$ 120,00")).not.toBeInTheDocument();
  });

  it("FS3: while travelFeeSettingsStatus is 'success', the Total line shows the correct computed monetary value", () => {
    renderStepSchedule({ travelFeeSettingsStatus: "success" });

    expect(screen.getByText("R$ 120,00")).toBeInTheDocument();
  });

  it("FS4: transitioning from an error state to a successful retry updates the Total line from the placeholder to the correct value", () => {
    const preview = computeOrderPreview({
      items: [{ quantity: "1.000", unitPrice: "100.00" }],
      orderDiscount: "0.00",
      travelFee: "20.00",
    });
    const { rerender } = renderStepSchedule({ travelFeeSettingsStatus: "error" });
    expect(screen.getByText("Total indisponível")).toBeInTheDocument();

    rerender(
      <StepSchedule
        title="Atendimento"
        onTitleChange={vi.fn()}
        description=""
        onDescriptionChange={vi.fn()}
        scheduledStart=""
        onScheduledStartChange={vi.fn()}
        scheduledEnd=""
        onScheduledEndChange={vi.fn()}
        scheduleError={null}
        travelFeeInput="20,00"
        onTravelFeeChange={vi.fn()}
        travelFeeSettingsStatus="success"
        onRetryTravelFeeSettings={vi.fn()}
        orderDiscountInput="0,00"
        onOrderDiscountChange={vi.fn()}
        orderDiscountError={null}
        notes=""
        onNotesChange={vi.fn()}
        customerName="Cliente Teste"
        addressLabel="Endereço principal"
        contactName={null}
        preview={preview}
        itemSummaries={[]}
        titleError={null}
        orderDiscountDecimal="0.00"
        travelFeeDecimal="20.00"
      />
    );

    expect(screen.queryByText("Total indisponível")).not.toBeInTheDocument();
    expect(screen.getByText("R$ 120,00")).toBeInTheDocument();
  });

  it("Subtotal is unaffected by travel-fee-settings status — it keeps showing its real value regardless", () => {
    renderStepSchedule({ travelFeeSettingsStatus: "loading" });
    expect(screen.getByText("R$ 100,00")).toBeInTheDocument();
  });
});

describe("StepSchedule — Resumo itemization and discount sign", () => {
  it("SU1: shows each item's name, quantity × unit price and line total — not just a count", () => {
    renderStepSchedule({
      itemSummaries: [{ name: "Pintura de parede", quantity: "1.000", unitPrice: "100.00", lineTotal: "100.00" }],
    });

    expect(screen.getByText("Pintura de parede")).toBeInTheDocument();
    expect(screen.getByText("1 × R$ 100,00")).toBeInTheDocument();
  });

  it("SU2: caps the visible item list and shows a '+ N mais' indicator for many items", () => {
    const itemSummaries = Array.from({ length: 6 }, (_, index) => ({
      name: `Item ${index + 1}`,
      quantity: "1.000",
      unitPrice: "10.00",
      lineTotal: "10.00",
    }));
    renderStepSchedule({ itemSummaries });

    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.queryByText("Item 6")).not.toBeInTheDocument();
    expect(screen.getByText("+ 2 mais")).toBeInTheDocument();
  });

  it("SU3: a zero order discount renders as 'R$ 0,00', never '-R$ 0,00'", () => {
    renderStepSchedule({ orderDiscountDecimal: "0.00" });

    expect(screen.getByText("R$ 0,00")).toBeInTheDocument();
    expect(screen.queryByText(/-\s*R\$ 0,00/)).not.toBeInTheDocument();
  });

  it("SU4: a genuine positive discount renders with a leading minus", () => {
    renderStepSchedule({ orderDiscountDecimal: "20.00" });

    expect(screen.getByText("- R$ 20,00")).toBeInTheDocument();
  });

  it("SU5: shows the selected customer, address label, and 'Sem contato' when no contact is selected", () => {
    renderStepSchedule({ customerName: "Sandro Pereira", addressLabel: "Endereço principal", contactName: null });

    expect(screen.getByText("Sandro Pereira")).toBeInTheDocument();
    expect(screen.getByText("Endereço principal")).toBeInTheDocument();
    expect(screen.getByText("Sem contato")).toBeInTheDocument();
  });

  it("SU6: shows the selected contact's name when one is selected", () => {
    renderStepSchedule({ contactName: "João da Obra" });

    expect(screen.getByText("João da Obra")).toBeInTheDocument();
  });

  it("SU7: changing the travel fee input calls the change handler (Total updates via the parent-recomputed preview)", async () => {
    const onTravelFeeChange = vi.fn();
    const user = userEvent.setup();
    renderStepSchedule({ onTravelFeeChange });

    const travelFeeInput = screen.getByLabelText("Deslocamento");
    await user.clear(travelFeeInput);
    await user.type(travelFeeInput, "5");

    expect(onTravelFeeChange).toHaveBeenCalled();
  });
});

describe("StepSchedule — non-field submit error banner", () => {
  it("SE1: renders the submit error with a retry button when retryable, and calls onRetrySubmit when clicked", async () => {
    const onRetrySubmit = vi.fn();
    const user = userEvent.setup();
    renderStepSchedule({
      submitError: "Não foi possível criar a O.S. agora. Tente novamente.",
      submitErrorRetryable: true,
      onRetrySubmit,
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/não foi possível criar a o\.s\. agora/i);
    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));
    expect(onRetrySubmit).toHaveBeenCalledTimes(1);
  });

  it("SE2: renders no retry button when the error is not retryable", () => {
    renderStepSchedule({
      submitError: "Carregue a taxa padrão de deslocamento antes de criar a O.S.",
      submitErrorRetryable: false,
      onRetrySubmit: vi.fn(),
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tentar novamente/i })).not.toBeInTheDocument();
  });

  it("SE3: renders no alert at all when there is no submit error", () => {
    renderStepSchedule({ submitError: null });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
