"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MoneyField } from "@/components/shared/money-field";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiValidationError } from "@/lib/api-client";
import { brlInputToDecimalString, decimalStringToMoneyInputValue } from "@/lib/currency";
import { getServiceOrderSettings, updateServiceOrderSettings } from "./service-orders-client";

type LoadStatus = "loading" | "success" | "error";

/**
 * "Configurar deslocamento" (list page) — the only place the global
 * `default_travel_fee` setting is ever mutated. Editing the travel fee
 * inside a single O.S. (wizard step 4) never touches this setting.
 *
 * §Tenant safety: belt-and-suspenders on top of the list page closing
 * this dialog on a company switch — the GET captures the active company
 * at fetch time and discards a late response if it has since changed;
 * the PUT captures the company at the "Salvar" click and, if the
 * company changed before it resolves, never applies the response to the
 * new tenant's UI (discarded quietly, matching the pattern used by the
 * wizard's quick-create dialogs).
 */
export function TravelFeeSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [feeInput, setFeeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function resetDraft() {
    setFeeInput("");
    setError(null);
    setSaving(false);
  }

  function fetchSettings(requestCompanyId: string | undefined) {
    getServiceOrderSettings()
      .then((settings) => {
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setFeeInput(decimalStringToMoneyInputValue(settings.default_travel_fee));
        setStatus("success");
      })
      .catch(() => {
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setStatus("error");
      });
  }

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("loading");
    setError(null);
    fetchSettings(activeCompanyId);
    // Re-fetches only when the dialog opens — a company change while
    // already open is handled by the effect below (close + reset), not
    // a refetch under the same open dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Belt-and-suspenders: the list page already closes this dialog on a
  // tenant switch, but this guards the component even if reused without
  // that caller-side behavior — no Company-A fetched/typed value may
  // flash under Company B.
  const openedCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    if (open) openedCompanyIdRef.current = activeCompanyId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (openedCompanyIdRef.current !== activeCompanyId) {
      resetDraft();
      setStatus("loading");
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, open]);

  function handleOpenChange(next: boolean) {
    if (!next) resetDraft();
    onOpenChange(next);
  }

  async function handleSave() {
    const decimal = brlInputToDecimalString(feeInput) ?? "0.00";
    const requestCompanyIdAtSubmit = activeCompanyId;
    setSaving(true);
    setError(null);
    try {
      await updateServiceOrderSettings({ default_travel_fee: decimal });
      if (activeCompanyIdRef.current !== requestCompanyIdAtSubmit) return;
      handleOpenChange(false);
    } catch (err) {
      if (activeCompanyIdRef.current !== requestCompanyIdAtSubmit) return;
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
                fetchSettings(activeCompanyId);
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
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
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
