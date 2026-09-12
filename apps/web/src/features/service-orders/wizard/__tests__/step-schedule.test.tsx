import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
