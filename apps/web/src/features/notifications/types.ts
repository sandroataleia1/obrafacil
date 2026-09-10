/** Mirrors the API's response contract exactly — see apps/api's NotificationSettingsResource. */
export interface NotificationSettings {
  whatsapp_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  daily_summary_enabled: boolean;
  daily_summary_time: string | null;
  weekly_summary_enabled: boolean;
  weekly_summary_day: number | null;
  weekly_summary_time: string | null;
  timezone: string;
  recipient_phone: string | null;
  can_enable_whatsapp: boolean;
}

export interface NotificationPreference {
  event_type: string;
  group: string;
  enabled: boolean;
}

export interface NotificationSettingsResponse {
  settings: NotificationSettings;
  preferences: NotificationPreference[];
}

/**
 * The PUT payload — deliberately narrower than NotificationSettings: no
 * `timezone`/`recipient_phone`/`can_enable_whatsapp` (server-derived,
 * read-only) and preferences carry only `event_type`/`enabled` (never
 * `group`, `channel`, or any other server-owned field).
 */
export interface NotificationSettingsUpdatePayload {
  whatsapp_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  daily_summary_enabled: boolean;
  daily_summary_time: string | null;
  weekly_summary_enabled: boolean;
  weekly_summary_day: number | null;
  weekly_summary_time: string | null;
  preferences: { event_type: string; enabled: boolean }[];
}
