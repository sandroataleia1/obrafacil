"use client";

import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import type { OrderPreviewResult } from "../money-preview";

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
  titleError,
  orderDiscountDecimal,
  travelFeeDecimal,
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
  titleError?: string | null;
  /** Normalized decimal strings ("0.00") for display — never the raw BR-typed input. */
  orderDiscountDecimal: string;
  travelFeeDecimal: string;
}) {
  return (
    <div className="space-y-6">
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
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Itens</span>
          <span className="font-medium text-foreground">{preview.lines.length}</span>
        </div>
        <div className="border-t border-border pt-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium text-foreground">{decimalStringToBrlDisplay(preview.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Desconto</span>
            <span className="font-medium text-foreground">-{decimalStringToBrlDisplay(orderDiscountDecimal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Deslocamento</span>
            <span className="font-medium text-foreground">{decimalStringToBrlDisplay(travelFeeDecimal)}</span>
          </div>
          <div className="flex items-center justify-between pt-1 text-base font-semibold text-foreground">
            <span>Total</span>
            <span>{decimalStringToBrlDisplay(preview.total)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
