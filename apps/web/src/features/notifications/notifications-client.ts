import { apiRequest } from "@/lib/api-client";
import type { NotificationSettingsResponse, NotificationSettingsUpdatePayload } from "./types";

export function getNotificationSettings(): Promise<NotificationSettingsResponse> {
  return apiRequest<NotificationSettingsResponse>("/api/v1/notifications/settings");
}

export function updateNotificationSettings(
  payload: NotificationSettingsUpdatePayload
): Promise<NotificationSettingsResponse> {
  return apiRequest<NotificationSettingsResponse>("/api/v1/notifications/settings", {
    method: "PUT",
    body: payload,
  });
}
