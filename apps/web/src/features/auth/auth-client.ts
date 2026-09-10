import { apiRequest } from "@/lib/api-client";
import type { MePayload } from "./types";

export interface RegisterPayload {
  company_name: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  password_confirmation: string;
}

export function fetchMe(): Promise<MePayload> {
  return apiRequest<MePayload>("/api/v1/me");
}

export function login(email: string, password: string): Promise<MePayload> {
  return apiRequest<MePayload>("/api/v1/login", { method: "POST", body: { email, password } });
}

export function register(payload: RegisterPayload): Promise<MePayload> {
  return apiRequest<MePayload>("/api/v1/register", { method: "POST", body: payload });
}

export function logout(): Promise<void> {
  return apiRequest<void>("/api/v1/logout", { method: "POST" });
}

export function activateCompany(companyId: string): Promise<MePayload> {
  return apiRequest<MePayload>(`/api/v1/companies/${encodeURIComponent(companyId)}/activate`, {
    method: "POST",
  });
}
