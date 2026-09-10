import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, ApiNetworkError } from "@/lib/api-client";
import { NotificationSettingsPage } from "../notification-settings-page";
import type { NotificationSettingsResponse } from "../types";

vi.mock("../notifications-client", () => ({
  getNotificationSettings: vi.fn(),
  updateNotificationSettings: vi.fn(),
}));

import { getNotificationSettings, updateNotificationSettings } from "../notifications-client";

const refresh = vi.fn();
const authState: {
  status: "authenticated";
  user: { id: string; name: string; email: string; phone: string | null };
  memberships: never[];
  activeCompany: { id: string; name: string } | null;
  requiresCompanySelection: boolean;
  refresh: typeof refresh;
  setSession: ReturnType<typeof vi.fn>;
  clearSession: ReturnType<typeof vi.fn>;
} = {
  status: "authenticated",
  user: { id: "u1", name: "User", email: "u@example.com", phone: "+5511999999999" },
  memberships: [],
  activeCompany: { id: "c1", name: "Empresa A" },
  requiresCompanySelection: false,
  refresh,
  setSession: vi.fn(),
  clearSession: vi.fn(),
};

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const BASE_SETTINGS: NotificationSettingsResponse["settings"] = {
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
};

const BASE_PREFERENCES: NotificationSettingsResponse["preferences"] = [
  { event_type: "service_order.created", group: "service_order", enabled: false },
  { event_type: "payable.due_today", group: "payable", enabled: true },
];

function baseResponse(overrides?: {
  settings?: Partial<NotificationSettingsResponse["settings"]>;
  preferences?: NotificationSettingsResponse["preferences"];
}): NotificationSettingsResponse {
  return {
    settings: { ...BASE_SETTINGS, ...overrides?.settings },
    preferences: overrides?.preferences ?? BASE_PREFERENCES.map((p) => ({ ...p })),
  };
}

async function renderReady(response: NotificationSettingsResponse = baseResponse()) {
  vi.mocked(getNotificationSettings).mockResolvedValue(response);
  render(<NotificationSettingsPage />);
  await screen.findByText("Notificações pelo WhatsApp");
  return userEvent.setup();
}

describe("NotificationSettingsPage", () => {
  beforeEach(() => {
    vi.mocked(getNotificationSettings).mockReset();
    vi.mocked(updateNotificationSettings).mockReset();
    refresh.mockReset();
    authState.activeCompany = { id: "c1", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** U1: an initial loading state is shown before the GET resolves. */
  it("U1: shows a loading state before the GET resolves", () => {
    const { promise } = deferred<NotificationSettingsResponse>();
    vi.mocked(getNotificationSettings).mockReturnValue(promise);

    render(<NotificationSettingsPage />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  /** U2: settings coming back from the API are rendered. */
  it("U2: renders settings returned by the API", async () => {
    await renderReady(baseResponse({ settings: { whatsapp_enabled: true } }));

    expect(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByLabelText("De")).toHaveValue("21:00");
    expect(screen.getByLabelText("Até")).toHaveValue("07:00");
  });

  /** U3: the phone is shown formatted, not raw E.164. */
  it("U3: renders the recipient phone formatted", async () => {
    await renderReady(baseResponse({ settings: { recipient_phone: "+5511988887777" } }));

    expect(screen.getByText("(11) 98888-7777")).toBeInTheDocument();
    expect(screen.queryByText("+5511988887777")).not.toBeInTheDocument();
  });

  /** U4: can_enable_whatsapp=false disables the activation switch and explains why. */
  it("U4: disables WhatsApp activation when can_enable_whatsapp is false", async () => {
    await renderReady(baseResponse({ settings: { can_enable_whatsapp: false, recipient_phone: null } }));

    expect(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(
      screen.getByText("Cadastre um WhatsApp válido na sua conta para ativar as notificações.")
    ).toBeInTheDocument();
  });

  /** U5: turning WhatsApp off locally never clears the individual preferences. */
  it("U5: turning WhatsApp off does not clear preferences", async () => {
    const user = await renderReady(baseResponse({ settings: { whatsapp_enabled: true } }));

    await user.click(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" }));

    expect(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
    expect(screen.getByRole("switch", { name: "Conta a pagar vence hoje" })).toHaveAttribute("aria-checked", "true");
  });

  /** U6: "Ativar todas" checks every preference locally. */
  it("U6: Ativar todas marks every preference as enabled locally", async () => {
    const user = await renderReady();

    await user.click(screen.getByRole("button", { name: "Ativar todas" }));

    expect(screen.getByRole("switch", { name: "Nova ordem de serviço" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Conta a pagar vence hoje" })).toHaveAttribute("aria-checked", "true");
  });

  /** U7: "Desativar todas" unchecks every preference locally. */
  it("U7: Desativar todas unmarks every preference locally", async () => {
    const user = await renderReady();

    await user.click(screen.getByRole("button", { name: "Desativar todas" }));

    expect(screen.getByRole("switch", { name: "Nova ordem de serviço" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Conta a pagar vence hoje" })).toHaveAttribute("aria-checked", "false");
  });

  /** U8: bulk actions never trigger a PUT by themselves. */
  it("U8: bulk actions do not save automatically", async () => {
    const user = await renderReady();

    await user.click(screen.getByRole("button", { name: "Ativar todas" }));
    await user.click(screen.getByRole("button", { name: "Desativar todas" }));

    expect(updateNotificationSettings).not.toHaveBeenCalled();
  });

  /** U9: groups render with Portuguese labels, not raw group identifiers. */
  it("U9: groups render with Portuguese labels", async () => {
    await renderReady();

    expect(screen.getByText("Ordens de Serviço")).toBeInTheDocument();
    expect(screen.getByText("Contas a pagar")).toBeInTheDocument();
    expect(screen.queryByText("service_order")).not.toBeInTheDocument();
    expect(screen.queryByText("payable")).not.toBeInTheDocument();
  });

  /** U10: event types render with friendly labels, never the raw identifier. */
  it("U10: event types render with friendly labels", async () => {
    await renderReady();

    expect(screen.getByText("Nova ordem de serviço")).toBeInTheDocument();
    expect(screen.getByText("Conta a pagar vence hoje")).toBeInTheDocument();
    expect(screen.queryByText("service_order.created")).not.toBeInTheDocument();
    expect(screen.queryByText("payable.due_today")).not.toBeInTheDocument();
  });

  /** U11: quiet hours toggle disables the time fields visually while preserving their values. */
  it("U11: quiet hours off disables the time fields but keeps their values", async () => {
    const user = await renderReady();

    await user.click(screen.getByRole("switch", { name: "Respeitar horário silencioso" }));

    expect(screen.getByLabelText("De")).toBeDisabled();
    expect(screen.getByLabelText("De")).toHaveValue("21:00");
    expect(screen.getByLabelText("Até")).toBeDisabled();
    expect(screen.getByLabelText("Até")).toHaveValue("07:00");
  });

  /** U12: start === end blocks saving with a controlled local message. */
  it("U12: start equal to end blocks saving", async () => {
    const user = await renderReady();

    await user.clear(screen.getByLabelText("Até"));
    await user.type(screen.getByLabelText("Até"), "21:00");

    expect(
      screen.getByText("O início e o fim do horário silencioso devem ser diferentes.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeDisabled();
  });

  /** U13: daily summary enabled without a time blocks saving. */
  it("U13: daily summary enabled without a time blocks saving", async () => {
    const user = await renderReady();

    await user.click(screen.getByRole("switch", { name: "Receber resumo diário" }));

    expect(screen.getByText("Defina um horário para o resumo diário.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeDisabled();
  });

  /** U14: weekly summary enabled without day+time blocks saving. */
  it("U14: weekly summary enabled without day and time blocks saving", async () => {
    const user = await renderReady();

    await user.click(screen.getByRole("switch", { name: "Receber resumo semanal" }));

    expect(screen.getByText("Defina o dia e o horário do resumo semanal.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeDisabled();
  });

  /** U15: Save sends a PUT and adopts the response as the new canonical snapshot. */
  it("U15: saving sends a PUT and uses the response as the new snapshot", async () => {
    const user = await renderReady();
    const savedResponse = baseResponse({ settings: { whatsapp_enabled: true } });
    vi.mocked(updateNotificationSettings).mockResolvedValue(savedResponse);

    await user.click(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateNotificationSettings).toHaveBeenCalledTimes(1));
    await screen.findByText("Configurações salvas.");
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeDisabled();
  });

  /** U16: a save failure never discards the user's local, unsaved choices. */
  it("U16: a save failure preserves local changes", async () => {
    const user = await renderReady();
    vi.mocked(updateNotificationSettings).mockRejectedValue(new ApiError(500, "Server error"));

    await user.click(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await screen.findByText("Não foi possível salvar as configurações.");
    expect(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  /** U16b: the same holds for a pure network failure. */
  it("U16b: a network failure during save preserves local changes", async () => {
    const user = await renderReady();
    vi.mocked(updateNotificationSettings).mockRejectedValue(new ApiNetworkError());

    await user.click(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await screen.findByText("Não foi possível salvar as configurações.");
    expect(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  /** U17: Descartar restores the exact last confirmed snapshot. */
  it("U17: Cancelar alterações restores the previous snapshot", async () => {
    const user = await renderReady();

    await user.click(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" }));
    expect(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    await user.click(screen.getByRole("button", { name: "Cancelar alterações" }));

    expect(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
    expect(updateNotificationSettings).not.toHaveBeenCalled();
  });

  /** U18: switching the active company reloads settings for the new company, never mixing data. */
  it("U18: switching the active company triggers a fresh reload", async () => {
    const companyAResponse = baseResponse({ settings: { whatsapp_enabled: true } });
    const companyBResponse = baseResponse({ settings: { whatsapp_enabled: false, recipient_phone: "+5511911112222" } });
    vi.mocked(getNotificationSettings).mockResolvedValueOnce(companyAResponse);

    const { rerender } = render(<NotificationSettingsPage />);
    await screen.findByText("Notificações pelo WhatsApp");
    expect(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    vi.mocked(getNotificationSettings).mockResolvedValueOnce(companyBResponse);
    authState.activeCompany = { id: "c2", name: "Empresa B" };
    rerender(<NotificationSettingsPage />);

    await waitFor(() => expect(getNotificationSettings).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Ativar notificações pelo WhatsApp" })).toHaveAttribute(
        "aria-checked",
        "false"
      )
    );
    expect(within(screen.getByText("(11) 91111-2222").closest("div")!).getByText("(11) 91111-2222")).toBeInTheDocument();
  });
});
