"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { eventLabel, groupLabel, WEEKDAY_LABELS, WEEKDAY_OPTIONS } from "./event-labels";
import { formatRecipientPhone } from "./format-recipient-phone";
import {
  buildUpdatePayload,
  groupPreferences,
  isFormDirty,
  localValidationError,
  toFormState,
  type NotificationFormState,
} from "./form-state";
import { getNotificationSettings, updateNotificationSettings } from "./notifications-client";
import type { NotificationSettingsResponse } from "./types";

type LoadStatus = "loading" | "success" | "error";

function mapValidationErrors(errors: Record<string, string[]>): Record<string, string> {
  const pick = (key: string) => errors[key]?.[0];
  const mapped: Record<string, string> = {};
  for (const key of [
    "whatsapp_enabled",
    "quiet_start",
    "quiet_end",
    "daily_summary_time",
    "weekly_summary_day",
    "weekly_summary_time",
    "preferences",
  ]) {
    const message = pick(key);
    if (message) mapped[key] = message;
  }
  return mapped;
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-0.5">
        <label htmlFor={id} className={disabled ? "text-sm font-medium text-muted-foreground" : "text-sm font-medium text-foreground"}>
          {label}
        </label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} className="mt-0.5 shrink-0" />
    </div>
  );
}

function TimeField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:w-40"
      />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="max-w-2xl space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Carregando configurações de notificação</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="max-w-2xl space-y-4">
      <BackLink title="Notificações" icon={Settings} href="/configuracoes" />
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          Não foi possível carregar as configurações de notificação.
        </p>
        <Button type="button" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}

export function NotificationSettingsPage() {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [original, setOriginal] = useState<NotificationSettingsResponse | null>(null);
  const [form, setForm] = useState<NotificationFormState | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedJustNow, setSavedJustNow] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadSettings = useCallback(async () => {
    setStatus("loading");
    setSaveError(null);
    setSavedJustNow(false);
    try {
      const response = await getNotificationSettings();
      setOriginal(response);
      setForm(toFormState(response));
      setStatus("success");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // §8: the global auth mechanism owns this — refreshing the session
        // state here is what makes AppShell notice and redirect to /login.
        void auth.refresh();
        return;
      }
      setStatus("error");
    }
    // Deliberately keyed only by the active company id (§34): re-running
    // this for every `auth` identity change (e.g. after the refresh() call
    // above resolves) would refetch needlessly; a company switch is the
    // one thing that must always trigger a fresh GET.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSettings();
  }, [loadSettings]);

  const dirty = useMemo(() => {
    if (!form || !original) return false;
    return isFormDirty(form, toFormState(original));
  }, [form, original]);

  const validationError = useMemo(() => (form ? localValidationError(form) : null), [form]);

  const canEnableWhatsapp = original?.settings.can_enable_whatsapp ?? false;
  const recipientPhone = original?.settings.recipient_phone ?? null;
  const timezone = original?.settings.timezone ?? null;

  const groups = useMemo(() => (form ? groupPreferences(form.preferences) : []), [form]);

  function updateForm(patch: Partial<NotificationFormState>) {
    setForm((previous) => (previous ? { ...previous, ...patch } : previous));
  }

  function togglePreference(eventType: string, enabled: boolean) {
    setForm((previous) =>
      previous
        ? {
            ...previous,
            preferences: previous.preferences.map((preference) =>
              preference.event_type === eventType ? { ...preference, enabled } : preference
            ),
          }
        : previous
    );
  }

  function setAllPreferences(enabled: boolean) {
    setForm((previous) =>
      previous
        ? { ...previous, preferences: previous.preferences.map((preference) => ({ ...preference, enabled })) }
        : previous
    );
  }

  function handleDiscard() {
    if (!original) return;
    setForm(toFormState(original));
    setFieldErrors({});
    setSaveError(null);
  }

  async function handleSave() {
    if (!form || saving) return;
    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    setSavedJustNow(false);

    try {
      const payload = buildUpdatePayload(form);
      const response = await updateNotificationSettings(payload);
      // §30: the response is the new canonical state — never assumed to
      // exactly mirror what was sent locally.
      setOriginal(response);
      setForm(toFormState(response));
      setSavedJustNow(true);
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFieldErrors(mapValidationErrors(error.errors));
      } else {
        // §33: a network/5xx failure never discards the user's local
        // choices — the form keeps whatever was there before this attempt.
        setSaveError("Não foi possível salvar as configurações.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return <LoadingState />;
  }

  if (status === "error" || !form) {
    return <ErrorState onRetry={() => void loadSettings()} />;
  }

  const canSubmit = dirty && !validationError && !saving;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <BackLink
          title="Notificações"
          description="Escolha quais avisos deseja receber e em quais horários."
          icon={Settings}
          href="/configuracoes"
        />
        <p className="text-xs text-muted-foreground">Canal atual: WhatsApp</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notificações pelo WhatsApp</CardTitle>
          <CardDescription>Receba avisos importantes sobre suas obras e operações.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchRow
            id="whatsapp-enabled"
            label="Ativar notificações pelo WhatsApp"
            checked={form.whatsapp_enabled}
            disabled={!canEnableWhatsapp}
            onCheckedChange={(checked) => updateForm({ whatsapp_enabled: checked })}
          />
          {!canEnableWhatsapp ? (
            <p role="alert" className="text-sm text-destructive">
              Cadastre um WhatsApp válido na sua conta para ativar as notificações.
            </p>
          ) : null}
          {fieldErrors.whatsapp_enabled ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldErrors.whatsapp_enabled}
            </p>
          ) : null}
          {recipientPhone ? (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">WhatsApp</p>
              <p className="text-sm font-medium text-foreground">{formatRecipientPhone(recipientPhone)}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
          <CardDescription>Escolha quais avisos individuais deseja receber.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAllPreferences(true)}>
              Ativar todas
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAllPreferences(false)}>
              Desativar todas
            </Button>
          </div>

          {groups.map(({ group, items }) => (
            <div key={group} className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
              <h3 className="text-sm font-semibold text-foreground">{groupLabel(group)}</h3>
              <div className="space-y-3">
                {items.map((preference) => (
                  <SwitchRow
                    key={preference.event_type}
                    id={`pref-${preference.event_type}`}
                    label={eventLabel(preference.event_type)}
                    checked={preference.enabled}
                    onCheckedChange={(checked) => togglePreference(preference.event_type, checked)}
                  />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Horário silencioso</CardTitle>
          <CardDescription>Durante esse período os avisos não urgentes serão enviados depois.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchRow
            id="quiet-hours-enabled"
            label="Respeitar horário silencioso"
            checked={form.quiet_hours_enabled}
            onCheckedChange={(checked) => updateForm({ quiet_hours_enabled: checked })}
          />
          <div className="flex flex-wrap gap-4">
            <TimeField
              id="quiet-start"
              label="De"
              value={form.quiet_start}
              disabled={!form.quiet_hours_enabled}
              onChange={(value) => updateForm({ quiet_start: value })}
            />
            <TimeField
              id="quiet-end"
              label="Até"
              value={form.quiet_end}
              disabled={!form.quiet_hours_enabled}
              onChange={(value) => updateForm({ quiet_end: value })}
            />
          </div>
          {fieldErrors.quiet_start || fieldErrors.quiet_end ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldErrors.quiet_start ?? fieldErrors.quiet_end}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumo diário</CardTitle>
          <CardDescription>Um resumo dos principais itens do dia.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchRow
            id="daily-summary-enabled"
            label="Receber resumo diário"
            checked={form.daily_summary_enabled}
            onCheckedChange={(checked) => updateForm({ daily_summary_enabled: checked })}
          />
          {form.daily_summary_enabled ? (
            <TimeField
              id="daily-summary-time"
              label="Horário"
              value={form.daily_summary_time}
              onChange={(value) => updateForm({ daily_summary_time: value })}
            />
          ) : null}
          {fieldErrors.daily_summary_time ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldErrors.daily_summary_time}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumo semanal</CardTitle>
          <CardDescription>Um resumo da semana em um único aviso.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchRow
            id="weekly-summary-enabled"
            label="Receber resumo semanal"
            checked={form.weekly_summary_enabled}
            onCheckedChange={(checked) => updateForm({ weekly_summary_enabled: checked })}
          />
          {form.weekly_summary_enabled ? (
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5">
                <label htmlFor="weekly-summary-day" className="text-sm font-medium text-foreground">
                  Dia da semana
                </label>
                <Select
                  value={form.weekly_summary_day !== null ? String(form.weekly_summary_day) : null}
                  onValueChange={(value) => updateForm({ weekly_summary_day: value ? Number(value) : null })}
                >
                  <SelectTrigger id="weekly-summary-day" className="h-11 w-full px-4 text-base sm:w-48">
                    <SelectValue placeholder="Selecione o dia">
                      {(value: string | null) => (value ? WEEKDAY_LABELS[Number(value)] : "Selecione o dia")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TimeField
                id="weekly-summary-time"
                label="Horário"
                value={form.weekly_summary_time}
                onChange={(value) => updateForm({ weekly_summary_time: value })}
              />
            </div>
          ) : null}
          {fieldErrors.weekly_summary_day || fieldErrors.weekly_summary_time ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldErrors.weekly_summary_day ?? fieldErrors.weekly_summary_time}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {timezone ? (
        <p className="text-xs text-muted-foreground">Fuso horário: {timezone}</p>
      ) : null}

      {validationError ? (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      ) : null}
      {fieldErrors.preferences ? (
        <p role="alert" className="text-sm text-destructive">
          {fieldErrors.preferences}
        </p>
      ) : null}
      {saveError ? (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      ) : null}
      {savedJustNow ? <p className="text-sm text-primary">Configurações salvas.</p> : null}

      <div className="flex flex-wrap items-center gap-3 pb-2">
        <Button type="button" onClick={() => void handleSave()} disabled={!canSubmit}>
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
        <Button type="button" variant="outline" onClick={handleDiscard} disabled={!dirty || saving}>
          Cancelar alterações
        </Button>
      </div>
    </div>
  );
}
