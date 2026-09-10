import type {
  NotificationPreference,
  NotificationSettingsResponse,
  NotificationSettingsUpdatePayload,
} from "./types";

export interface NotificationFormState {
  whatsapp_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  daily_summary_enabled: boolean;
  daily_summary_time: string;
  weekly_summary_enabled: boolean;
  weekly_summary_day: number | null;
  weekly_summary_time: string;
  preferences: NotificationPreference[];
}

/** The API's GET/PUT response is the authority (§8) — this only reshapes it into an editable local copy, never invents a default the server didn't send. */
export function toFormState(response: NotificationSettingsResponse): NotificationFormState {
  const { settings, preferences } = response;
  return {
    whatsapp_enabled: settings.whatsapp_enabled,
    quiet_hours_enabled: settings.quiet_hours_enabled,
    quiet_start: settings.quiet_start ?? "",
    quiet_end: settings.quiet_end ?? "",
    daily_summary_enabled: settings.daily_summary_enabled,
    daily_summary_time: settings.daily_summary_time ?? "",
    weekly_summary_enabled: settings.weekly_summary_enabled,
    weekly_summary_day: settings.weekly_summary_day,
    weekly_summary_time: settings.weekly_summary_time ?? "",
    preferences: preferences.map((preference) => ({ ...preference })),
  };
}

/**
 * §24/§29: the payload always matches the API's full snapshot contract,
 * never `group`/`timezone`/`recipient_phone`/`can_enable_whatsapp`/
 * `channel`/`company_id`/`user_id`/`provider`. A disabled summary always
 * normalizes its own timing fields to null — never whatever stale value
 * happens to still be sitting in the form from before it was switched off.
 */
export function buildUpdatePayload(form: NotificationFormState): NotificationSettingsUpdatePayload {
  return {
    whatsapp_enabled: form.whatsapp_enabled,
    quiet_hours_enabled: form.quiet_hours_enabled,
    quiet_start: form.quiet_start,
    quiet_end: form.quiet_end,
    daily_summary_enabled: form.daily_summary_enabled,
    daily_summary_time: form.daily_summary_enabled ? form.daily_summary_time || null : null,
    weekly_summary_enabled: form.weekly_summary_enabled,
    weekly_summary_day: form.weekly_summary_enabled ? form.weekly_summary_day : null,
    weekly_summary_time: form.weekly_summary_enabled ? form.weekly_summary_time || null : null,
    preferences: form.preferences.map((preference) => ({
      event_type: preference.event_type,
      enabled: preference.enabled,
    })),
  };
}

/** Two form states have nothing to save between them when their normalized PUT payloads are identical. */
export function isFormDirty(current: NotificationFormState, original: NotificationFormState): boolean {
  return JSON.stringify(buildUpdatePayload(current)) !== JSON.stringify(buildUpdatePayload(original));
}

export function localValidationError(form: NotificationFormState): string | null {
  if (form.quiet_hours_enabled && form.quiet_start !== "" && form.quiet_start === form.quiet_end) {
    return "O início e o fim do horário silencioso devem ser diferentes.";
  }
  if (form.daily_summary_enabled && !form.daily_summary_time) {
    return "Defina um horário para o resumo diário.";
  }
  if (form.weekly_summary_enabled && (!form.weekly_summary_day || !form.weekly_summary_time)) {
    return "Defina o dia e o horário do resumo semanal.";
  }
  return null;
}

const GROUP_ORDER = ["service_order", "payable", "receivable", "project", "purchase", "stock", "team"];

export interface PreferenceGroup {
  group: string;
  items: NotificationPreference[];
}

/** Stable, predictable group ordering for the UI — the API's array order isn't a contract. */
export function groupPreferences(preferences: NotificationPreference[]): PreferenceGroup[] {
  const byGroup = new Map<string, NotificationPreference[]>();
  for (const preference of preferences) {
    const list = byGroup.get(preference.group) ?? [];
    list.push(preference);
    byGroup.set(preference.group, list);
  }

  const knownFirst = GROUP_ORDER.filter((group) => byGroup.has(group));
  const unknownAfter = [...byGroup.keys()].filter((group) => !GROUP_ORDER.includes(group));

  return [...knownFirst, ...unknownAfter].map((group) => ({ group, items: byGroup.get(group)! }));
}
