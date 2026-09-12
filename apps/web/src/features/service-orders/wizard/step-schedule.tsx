"use client";

import { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { formatQuantity } from "@/lib/quantity";
import type { OrderPreviewResult } from "../money-preview";

/** A single already-validated item, snapshotted for the Resumo's itemized
 * list — display fields only (name) alongside the already-normalized
 * quantity/unit price/line total decimal strings the wizard computed. */
export interface ItemSummary {
  name: string;
  /** Decimal string, e.g. "1.000" — a real quantity, formatted for display only here. */
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

/** Show at most this many items inline before collapsing the rest behind
 * a "+ N mais" indicator — the summary must never hide ALL item detail
 * behind a bare count, but an unbounded list would grow the sticky
 * summary past the viewport on an order with many lines. */
const MAX_VISIBLE_SUMMARY_ITEMS = 4;

/** A genuinely positive discount is shown with a leading minus; an exact
 * zero discount ("0.00", the default/no-discount case) must never render
 * as "-R$ 0,00" — that reads as a discount was applied when none was. */
function discountDisplay(decimal: string): string {
  const display = decimalStringToBrlDisplay(decimal) ?? "R$ 0,00";
  return decimal === "0.00" ? display : `- ${display}`;
}

export function StepSchedule({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  scheduledStart,
  onScheduledStartChange,
  scheduledEnd,
  onScheduledEndChange,
  scheduleError,
  travelFeeInput,
  onTravelFeeChange,
  travelFeeSettingsStatus,
  onRetryTravelFeeSettings,
  orderDiscountInput,
  onOrderDiscountChange,
  orderDiscountError,
  notes,
  onNotesChange,
  customerName,
  addressLabel,
  contactName,
  preview,
  itemSummaries,
  titleError,
  orderDiscountDecimal,
  travelFeeDecimal,
  submitError,
  submitErrorRetryable,
  onRetrySubmit,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  scheduledStart: string;
  onScheduledStartChange: (value: string) => void;
  scheduledEnd: string;
  onScheduledEndChange: (value: string) => void;
  scheduleError: string | null;
  travelFeeInput: string;
  onTravelFeeChange: (value: string) => void;
  travelFeeSettingsStatus: "loading" | "success" | "error";
  onRetryTravelFeeSettings: () => void;
  orderDiscountInput: string;
  onOrderDiscountChange: (value: string) => void;
  orderDiscountError: string | null;
  notes: string;
  onNotesChange: (value: string) => void;
  customerName: string;
  addressLabel: string;
  contactName: string | null;
  preview: OrderPreviewResult;
  /** Already-validated items, in the same order as `preview.lines`. */
  itemSummaries: ItemSummary[];
  titleError?: string | null;
  /** Normalized decimal strings ("0.00") for display — never the raw BR-typed input. */
  orderDiscountDecimal: string;
  travelFeeDecimal: string;
  /** Non-field submit failure (401/403/419/5xx/network) — never a validation error, which is field-routed instead. */
  submitError?: string | null;
  /** True when "Tentar novamente" should re-fire the submit directly. */
  submitErrorRetryable?: boolean;
  onRetrySubmit?: () => void;
}) {
  const submitErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!submitError) return;
    // jsdom (this codebase's test environment) doesn't implement
    // `scrollIntoView` at all — guard the call rather than relying on
    // every test file that can surface a submit error to polyfill it.
    if (typeof submitErrorRef.current?.scrollIntoView === "function") {
      submitErrorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    submitErrorRef.current?.focus();
  }, [submitError]);

  const visibleItems = itemSummaries.slice(0, MAX_VISIBLE_SUMMARY_ITEMS);
  const hiddenItemCount = itemSummaries.length - visibleItems.length;

  const dadosSection = (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Dados da O.S.</h2>
      <div className="space-y-1.5">
        <label htmlFor="os-title" className="text-sm font-medium text-foreground">
          Título
        </label>
        <input
          id="os-title"
          type="text"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
        {titleError ? (
          <p role="alert" className="text-xs text-destructive">
            {titleError}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="os-description" className="text-sm font-medium text-foreground">
          Descrição <span className="text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          id="os-description"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          rows={2}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
      </div>
    </section>
  );

  const agendamentoSection = (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Agendamento</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="os-start" className="text-sm font-medium text-foreground">
            Início previsto <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="os-start"
            type="datetime-local"
            value={scheduledStart}
            onChange={(event) => onScheduledStartChange(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="os-end" className="text-sm font-medium text-foreground">
            Fim previsto <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="os-end"
            type="datetime-local"
            value={scheduledEnd}
            onChange={(event) => onScheduledEndChange(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      {scheduleError ? (
        <p role="alert" className="text-xs text-destructive">
          {scheduleError}
        </p>
      ) : null}
    </section>
  );

  const valoresSection = (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Valores</h2>
      {travelFeeSettingsStatus === "error" ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar a taxa padrão.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRetryTravelFeeSettings}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <MoneyField id="os-travel-fee" label="Deslocamento" value={travelFeeInput} onChange={onTravelFeeChange} />
      )}
      <MoneyField id="os-order-discount" label="Desconto" value={orderDiscountInput} onChange={onOrderDiscountChange} />
      {orderDiscountError ? (
        <p role="alert" className="text-xs text-destructive">
          {orderDiscountError}
        </p>
      ) : null}
      <div className="space-y-1.5">
        <label htmlFor="os-notes" className="text-sm font-medium text-foreground">
          Observações <span className="text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          id="os-notes"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          rows={2}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
      </div>
    </section>
  );

  const resumoSection = (
    <section className="space-y-2 rounded-xl border border-border bg-card p-4">
      <h2 className="pb-1 text-sm font-semibold text-foreground">Resumo</h2>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Cliente</span>
        <span className="font-medium text-foreground">{customerName}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Local</span>
        <span className="font-medium text-foreground">{addressLabel}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Contato</span>
        <span className="font-medium text-foreground">{contactName ?? "Sem contato"}</span>
      </div>

      <div className="space-y-1.5 border-t border-border pt-2">
        <span className="text-sm text-muted-foreground">Itens</span>
        {itemSummaries.length === 0 ? (
          <p className="text-sm font-medium text-foreground">Nenhum item</p>
        ) : (
          <ul className="space-y-1.5">
            {visibleItems.map((item, index) => (
              <li key={index} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatQuantity(Number(item.quantity))} × {decimalStringToBrlDisplay(item.unitPrice)}
                  </span>
                </span>
                <span className="shrink-0 font-medium text-foreground">{decimalStringToBrlDisplay(item.lineTotal)}</span>
              </li>
            ))}
            {hiddenItemCount > 0 ? (
              <li className="text-xs text-muted-foreground">+ {hiddenItemCount} mais</li>
            ) : null}
          </ul>
        )}
      </div>

      <div className="border-t border-border pt-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium text-foreground">{decimalStringToBrlDisplay(preview.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Desconto</span>
          <span className="font-medium text-foreground">{discountDisplay(orderDiscountDecimal)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Deslocamento</span>
          <span className="font-medium text-foreground">
            {travelFeeSettingsStatus === "success"
              ? decimalStringToBrlDisplay(travelFeeDecimal)
              : travelFeeSettingsStatus === "loading"
                ? "Carregando..."
                : "Taxa padrão indisponível"}
          </span>
        </div>
        <div className="flex items-center justify-between pt-1 text-base font-semibold text-foreground">
          <span>Total</span>
          <span>
            {travelFeeSettingsStatus === "success"
              ? decimalStringToBrlDisplay(preview.total)
              : travelFeeSettingsStatus === "loading"
                ? "Calculando..."
                : "Total indisponível"}
          </span>
        </div>
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      {submitError ? (
        <div
          ref={submitErrorRef}
          tabIndex={-1}
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive outline-none"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex-1 space-y-2">
            <p>{submitError}</p>
            {submitErrorRetryable && onRetrySubmit ? (
              <Button type="button" variant="outline" size="sm" onClick={onRetrySubmit}>
                Tentar novamente
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div className="space-y-6">
          {dadosSection}
          {agendamentoSection}
          {valoresSection}
        </div>
        <div className="mt-6 lg:sticky lg:top-20 lg:mt-0">{resumoSection}</div>
      </div>
    </div>
  );
}
