import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest, ApiError, ApiNetworkError, ApiValidationError, ensureCsrfCookie } from "../api-client";

/** Routes a fetch mock by URL, defaulting csrf-cookie to a healthy 204 unless overridden. */
function routedFetchMock(overrides: Record<string, () => Response> = {}) {
  return vi.fn().mockImplementation((url: string) => {
    for (const [match, respond] of Object.entries(overrides)) {
      if (url.includes(match)) return Promise.resolve(respond());
    }
    if (url.includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });
}

describe("api-client", () => {
  beforeEach(() => {
    document.cookie = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("F1: every request is sent with credentials: include", async () => {
    const fetchMock = routedFetchMock();
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
    const fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/v1/me");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("F3: a 401 response becomes an ApiError with status 401", async () => {
    const fetchMock = routedFetchMock({
      "/api/v1/me": () => new Response(JSON.stringify({ message: "Unauthenticated." }), { status: 401 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = apiRequest("/api/v1/me");
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise.catch((error: ApiError) => error.status)).resolves.toBe(401);
  });

  it("F4: a 422 response preserves the per-field errors", async () => {
    const fetchMock = routedFetchMock({
      "/api/v1/register": () =>
        new Response(
          JSON.stringify({
            message: "Validation failed",
            errors: { email: ["The email field is required."], phone: ["The phone is invalid."] },
          }),
          { status: 422 }
        ),
    });
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
    const fetchMock = routedFetchMock({
      "/api/v1/login": () => new Response(JSON.stringify({ message: "Too Many Requests" }), { status: 429 }),
    });
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

  describe("NEXT_PUBLIC_API_URL configuration (Gate FRONTEND-AUTH-01A)", () => {
    const ORIGINAL_URL = process.env.NEXT_PUBLIC_API_URL;

    afterEach(() => {
      process.env.NEXT_PUBLIC_API_URL = ORIGINAL_URL;
      vi.resetModules();
    });

    it("C1: a valid NEXT_PUBLIC_API_URL is used as the request origin", async () => {
      vi.resetModules();
      process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/";
      const fresh = await import("../api-client");

      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      await fresh.apiRequest("/api/v1/me");

      // Trailing slash from the env value is stripped (§6).
      expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/v1/me", expect.anything());
    });

    it("C2: an absent NEXT_PUBLIC_API_URL never silently falls back to localhost — it throws instead", async () => {
      vi.resetModules();
      delete process.env.NEXT_PUBLIC_API_URL;

      await expect(import("../api-client")).rejects.toThrow(/NEXT_PUBLIC_API_URL/);
    });
  });

  describe("ensureCsrfCookie response handling (Gate FRONTEND-AUTH-01A §7/§8)", () => {
    it("C3: a 2xx/204 csrf-cookie response is treated as success", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal("fetch", fetchMock);

      await expect(ensureCsrfCookie()).resolves.toBeUndefined();
    });

    it("C4: a 500 csrf-cookie response becomes an ApiError, not a silent success", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "boom" }), { status: 500 }));
      vi.stubGlobal("fetch", fetchMock);

      const promise = ensureCsrfCookie();
      await expect(promise).rejects.toBeInstanceOf(ApiError);
      await expect(promise.catch((error: ApiError) => error.status)).resolves.toBe(500);
    });

    it("C5: a csrf-cookie network failure becomes ApiNetworkError, not ApiError", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      vi.stubGlobal("fetch", fetchMock);

      const promise = ensureCsrfCookie();
      await expect(promise).rejects.toBeInstanceOf(ApiNetworkError);
      await expect(promise).rejects.not.toBeInstanceOf(ApiError);
    });

    it("C6: a mutating request never reaches the server when CSRF initialization fails", async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes("csrf-cookie")) {
          return Promise.resolve(new Response(JSON.stringify({ message: "boom" }), { status: 503 }));
        }
        throw new Error("the real mutating request must never be attempted");
      });
      vi.stubGlobal("fetch", fetchMock);

      const promise = apiRequest("/api/v1/login", { method: "POST", body: { email: "a@b.com", password: "x" } });
      await expect(promise).rejects.toBeInstanceOf(ApiError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  // ================= HTTP1-HTTP10 (FRONTEND-COMPANY-PROFILE-01 §6-9) — FormData/multipart support =================

  /** HTTP1: a JSON body still gets Content-Type: application/json. */
  it("HTTP1: a JSON body still sets Content-Type: application/json", async () => {
    const fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/v1/login", { method: "POST", body: { email: "a@b.com" } });

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/v1/login"))!;
    const headers = call[1].headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  /** HTTP2: a JSON body is still JSON.stringify'd. */
  it("HTTP2: a JSON body is still JSON.stringify'd", async () => {
    const fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/v1/login", { method: "POST", body: { email: "a@b.com" } });

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/v1/login"))!;
    expect(call[1].body).toBe(JSON.stringify({ email: "a@b.com" }));
  });

  /** HTTP3: a FormData body never gets a manually-set Content-Type. */
  it("HTTP3: a FormData body has no manually-set Content-Type", async () => {
    const fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("logo", new Blob(["fake"], { type: "image/png" }), "logo.png");
    await apiRequest("/api/v1/company/profile/logo", { method: "POST", body: form });

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/logo"))!;
    const headers = call[1].headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  /** HTTP4: a FormData body is passed directly to fetch, never stringified. */
  it("HTTP4: a FormData body reaches fetch directly, unmodified", async () => {
    const fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("logo", new Blob(["fake"], { type: "image/png" }), "logo.png");
    await apiRequest("/api/v1/company/profile/logo", { method: "POST", body: form });

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/logo"))!;
    expect(call[1].body).toBe(form);
    expect(call[1].body).toBeInstanceOf(FormData);
  });

  /** HTTP5: a mutating FormData request still fetches the CSRF cookie first. */
  it("HTTP5: a FormData mutating request still calls ensureCsrfCookie first", async () => {
    const calledUrls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      calledUrls.push(url);
      if (url.includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("logo", new Blob(["fake"]), "logo.png");
    await apiRequest("/api/v1/company/profile/logo", { method: "POST", body: form });

    expect(calledUrls).toHaveLength(2);
    expect(calledUrls[0]).toContain("/sanctum/csrf-cookie");
    expect(calledUrls[1]).toContain("/logo");
  });

  /** HTTP6: X-XSRF-TOKEN is preserved for a FormData request. */
  it("HTTP6: X-XSRF-TOKEN header is preserved for a FormData request", async () => {
    document.cookie = "XSRF-TOKEN=abc123";
    const fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("logo", new Blob(["fake"]), "logo.png");
    await apiRequest("/api/v1/company/profile/logo", { method: "POST", body: form });

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/logo"))!;
    const headers = call[1].headers as Record<string, string>;
    expect(headers["X-XSRF-TOKEN"]).toBe("abc123");
  });

  /** HTTP7: credentials: include is preserved for a FormData request. */
  it("HTTP7: credentials: include is preserved for a FormData request", async () => {
    const fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("logo", new Blob(["fake"]), "logo.png");
    await apiRequest("/api/v1/company/profile/logo", { method: "POST", body: form });

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/logo"))!;
    expect(call[1].credentials).toBe("include");
  });

  /** HTTP8: a 422 on a multipart request becomes ApiValidationError. */
  it("HTTP8: a 422 multipart response becomes ApiValidationError", async () => {
    const fetchMock = routedFetchMock({
      "/logo": () =>
        new Response(JSON.stringify({ message: "Validation failed", errors: { logo: ["Invalid file."] } }), {
          status: 422,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("logo", new Blob(["fake"]), "logo.svg");
    const promise = apiRequest("/api/v1/company/profile/logo", { method: "POST", body: form });

    await expect(promise).rejects.toBeInstanceOf(ApiValidationError);
    await expect(promise.catch((error: ApiValidationError) => error.errors.logo)).resolves.toEqual(["Invalid file."]);
  });

  /** HTTP9: a 500 on a multipart request becomes ApiError. */
  it("HTTP9: a 500 multipart response becomes ApiError", async () => {
    const fetchMock = routedFetchMock({
      "/logo": () => new Response(JSON.stringify({ message: "boom" }), { status: 500 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("logo", new Blob(["fake"]), "logo.png");
    const promise = apiRequest("/api/v1/company/profile/logo", { method: "POST", body: form });

    await expect(promise).rejects.toBeInstanceOf(ApiError);
  });

  /** HTTP10: a network failure on a multipart request becomes ApiNetworkError. */
  it("HTTP10: a network failure on a multipart request becomes ApiNetworkError", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.reject(new TypeError("Failed to fetch"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("logo", new Blob(["fake"]), "logo.png");
    const promise = apiRequest("/api/v1/company/profile/logo", { method: "POST", body: form });

    await expect(promise).rejects.toBeInstanceOf(ApiNetworkError);
  });
});
