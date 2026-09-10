import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiNetworkError, ApiValidationError } from "@/lib/api-client";
import { getNotificationSettings, updateNotificationSettings } from "../notifications-client";
import type { NotificationSettingsUpdatePayload } from "../types";

type FetchInit = RequestInit & { body?: string };
type FetchMock = ReturnType<typeof vi.fn<(url: string, init?: FetchInit) => Promise<Response>>>;

const SAMPLE_RESPONSE = {
  settings: {
    whatsapp_enabled: false,
    quiet_hours_enabled: true,
    quiet_start: "21:00",
    quiet_end: "07:00",
    daily_summary_enabled: false,
    daily_summary_time: null,
    weekly_summary_enabled: false,
    weekly_summary_day: null,
    weekly_summary_time: null,
    timezone: "America/Sao_Paulo",
    recipient_phone: "+5511999999999",
    can_enable_whatsapp: true,
  },
  preferences: [{ event_type: "payable.due_today", group: "payable", enabled: false }],
};

const SAMPLE_PAYLOAD: NotificationSettingsUpdatePayload = {
  whatsapp_enabled: true,
  quiet_hours_enabled: true,
  quiet_start: "21:00",
  quiet_end: "07:00",
  daily_summary_enabled: false,
  daily_summary_time: null,
  weekly_summary_enabled: false,
  weekly_summary_day: null,
  weekly_summary_time: null,
  preferences: [{ event_type: "payable.due_today", enabled: true }],
};

describe("notifications-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** C1: GET uses apiRequest correctly — GET, no body, credentials included. */
  it("C1: getNotificationSettings sends a plain GET to the settings endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getNotificationSettings();

    expect(result).toEqual(SAMPLE_RESPONSE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v1/notifications/settings");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeUndefined();
  });

  /** C2: PUT sends the complete snapshot payload. */
  it("C2: updateNotificationSettings sends the full snapshot payload", async () => {
    const fetchMock: FetchMock = vi.fn().mockImplementation((url) => {
      if (String(url).includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateNotificationSettings(SAMPLE_PAYLOAD);

    const putCall = fetchMock.mock.calls.find((call) => !String(call[0]).includes("csrf-cookie"))!;
    const [url, init] = putCall;
    expect(String(url)).toContain("/api/v1/notifications/settings");
    expect(init!.method).toBe("PUT");
    const body = JSON.parse(init!.body!);
    expect(body).toEqual(SAMPLE_PAYLOAD);
  });

  /** C3: PUT never sends `group` — only event_type/enabled per preference. */
  it("C3: updateNotificationSettings never sends `group` in preferences", async () => {
    const fetchMock: FetchMock = vi.fn().mockImplementation((url) => {
      if (String(url).includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateNotificationSettings(SAMPLE_PAYLOAD);

    const putCall = fetchMock.mock.calls.find((call) => !String(call[0]).includes("csrf-cookie"))!;
    const body = JSON.parse(putCall[1]!.body!);
    for (const preference of body.preferences) {
      expect(Object.keys(preference).sort()).toEqual(["enabled", "event_type"]);
    }
  });

  /** C4: PUT never sends timezone/recipient_phone/can_enable_whatsapp/channel/company_id/user_id/provider. */
  it("C4: updateNotificationSettings never sends server-owned/read-only fields", async () => {
    const fetchMock: FetchMock = vi.fn().mockImplementation((url) => {
      if (String(url).includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateNotificationSettings(SAMPLE_PAYLOAD);

    const putCall = fetchMock.mock.calls.find((call) => !String(call[0]).includes("csrf-cookie"))!;
    const body = JSON.parse(putCall[1]!.body!);
    for (const forbiddenKey of [
      "timezone",
      "recipient_phone",
      "can_enable_whatsapp",
      "channel",
      "company_id",
      "user_id",
      "provider",
      "group",
    ]) {
      expect(body).not.toHaveProperty(forbiddenKey);
    }
  });

  /** C5: a 422 response surfaces as ApiValidationError with the field errors intact. */
  it("C5: a 422 response is preserved as ApiValidationError", async () => {
    const fetchMock: FetchMock = vi.fn().mockImplementation((url) => {
      if (String(url).includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(
        new Response(JSON.stringify({ errors: { whatsapp_enabled: ["WhatsApp cannot be enabled..."] } }), {
          status: 422,
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateNotificationSettings(SAMPLE_PAYLOAD)).rejects.toBeInstanceOf(ApiValidationError);
    try {
      await updateNotificationSettings(SAMPLE_PAYLOAD);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiValidationError);
      expect((error as ApiValidationError).errors.whatsapp_enabled?.[0]).toBe("WhatsApp cannot be enabled...");
    }
  });

  /** C6: a network failure surfaces as ApiNetworkError, never silently swallowed. */
  it("C6: a network error is preserved as ApiNetworkError", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getNotificationSettings()).rejects.toBeInstanceOf(ApiNetworkError);
  });
});
