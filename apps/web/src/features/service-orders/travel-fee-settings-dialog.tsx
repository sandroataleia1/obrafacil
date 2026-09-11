"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MoneyField } from "@/components/shared/money-field";
import { ApiValidationError } from "@/lib/api-client";
import { brlInputToDecimalString, decimalStringToMoneyInputValue } from "@/lib/currency";
import { getServiceOrderSettings, updateServiceOrderSettings } from "./service-orders-client";

type LoadStatus = "loading" | "success" | "error";

/**
 * "Configurar deslocamento" (list page) — the only place the global
 * `default_travel_fee` setting is ever mutated. Editing the travel fee
 * inside a single O.S. (wizard step 4) never touches this setting.
 */
export function TravelFeeSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [feeInput, setFeeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("loading");
    setError(null);
    getServiceOrderSettings()
      .then((settings) => {
        setFeeInput(decimalStringToMoneyInputValue(settings.default_travel_fee));
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [open]);

  async function handleSave() {
    const decimal = brlInputToDecimalString(feeInput) ?? "0.00";
    setSaving(true);
    setError(null);
    try {
      await updateServiceOrderSettings({ default_travel_fee: decimal });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiValidationError) {
        setError(err.errors.default_travel_fee?.[0] ?? "Valor inválido.");
      } else {
        setError("Não foi possível salvar a taxa padrão agora.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar deslocamento</DialogTitle>
          <DialogDescription>
            Essa taxa é preenchida automaticamente em novas O.S. e pode ser ajustada individualmente em cada uma.
          </DialogDescription>
        </DialogHeader>

        {status === "loading" ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : status === "error" ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              Não foi possível carregar a taxa padrão.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStatus("loading");
                getServiceOrderSettings()
                  .then((settings) => {
                    setFeeInput(decimalStringToMoneyInputValue(settings.default_travel_fee));
                    setStatus("success");
                  })
                  .catch(() => setStatus("error"));
              }}
            >
              Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <MoneyField id="default-travel-fee" label="Taxa padrão de deslocamento" value={feeInput} onChange={setFeeInput} />
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={status !== "success" || saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
