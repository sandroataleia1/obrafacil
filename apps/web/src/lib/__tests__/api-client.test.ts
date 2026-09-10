import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest, ApiError, ApiNetworkError, ApiValidationError } from "../api-client";

describe("api-client", () => {
  beforeEach(() => {
    document.cookie = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("F1: every request is sent with credentials: include", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/v1/me");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("F2: the CSRF cookie is fetched before a mutating request, in order", async () => {
    const calledUrls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      calledUrls.push(url);
      if (url.includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/v1/login", { method: "POST", body: { email: "a@b.com", password: "x" } });

    expect(calledUrls).toHaveLength(2);
    expect(calledUrls[0]).toContain("/sanctum/csrf-cookie");
    expect(calledUrls[1]).toContain("/api/v1/login");
  });

  it("F2b: a GET request never fetches the CSRF cookie first", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/v1/me");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("F3: a 401 response becomes an ApiError with status 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: "Unauthenticated." }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = apiRequest("/api/v1/me");
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise.catch((error: ApiError) => error.status)).resolves.toBe(401);
  });

  it("F4: a 422 response preserves the per-field errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Validation failed",
          errors: { email: ["The email field is required."], phone: ["The phone is invalid."] },
        }),
        { status: 422 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await apiRequest("/api/v1/register", { method: "POST", body: {} });
      expect.unreachable("apiRequest should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiValidationError);
      const validationError = error as ApiValidationError;
      expect(validationError.errors.email).toEqual(["The email field is required."]);
      expect(validationError.errors.phone).toEqual(["The phone is invalid."]);
    }
  });

  it("F5: a 429 response is distinguished from other error statuses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: "Too Many Requests" }), { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = apiRequest("/api/v1/login", { method: "POST", body: {} });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise.catch((error: ApiError) => error.status)).resolves.toBe(429);
  });

  it("F6: a network error never surfaces as ApiError/ApiValidationError (never mistaken for invalid credentials)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const promise = apiRequest("/api/v1/login", { method: "POST", body: { email: "a@b.com", password: "x" } });
    await expect(promise).rejects.toBeInstanceOf(ApiNetworkError);
    await expect(promise).rejects.not.toBeInstanceOf(ApiError);
    await expect(promise).rejects.not.toBeInstanceOf(ApiValidationError);
  });
});
