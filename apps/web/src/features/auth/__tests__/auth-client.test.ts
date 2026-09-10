import { afterEach, describe, expect, it, vi } from "vitest";

import { performLogoutRequest } from "../auth-client";

/**
 * Routes a fetch mock by URL substring. `logoutResponses` is consumed in
 * order (one entry per POST /api/v1/logout call) so tests can express
 * "first attempt X, retry Y" directly.
 */
function routedFetchMock(options: {
  logoutResponses: Array<() => Response>;
  meResponse?: () => Response;
}) {
  let logoutCallIndex = 0;

  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("csrf-cookie")) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url.includes("/api/v1/logout")) {
      const respond = options.logoutResponses[logoutCallIndex];
      logoutCallIndex += 1;
      if (!respond) throw new Error(`Unexpected extra /logout call (#${logoutCallIndex})`);
      return Promise.resolve(respond());
    }
    if (url.includes("/api/v1/me")) {
      if (!options.meResponse) throw new Error("Unexpected /me call — no meResponse configured");
      return Promise.resolve(options.meResponse());
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  });
}

describe("performLogoutRequest (Gate FRONTEND-AUTH-01A)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** L1: 204 -> signed-out. */
  it("L1: a 204 response signs the user out", async () => {
    vi.stubGlobal("fetch", routedFetchMock({ logoutResponses: [() => new Response(null, { status: 204 })] }));

    await expect(performLogoutRequest()).resolves.toBe("signed-out");
  });

  /** L2: the server itself confirms the session is already gone. */
  it("L2: a 401 from /logout itself signs the user out (session already expired)", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetchMock({
        logoutResponses: [() => new Response(JSON.stringify({ message: "Unauthenticated." }), { status: 401 })],
      })
    );

    await expect(performLogoutRequest()).resolves.toBe("signed-out");
  });

  /** L3: a network error never fabricates "signed out". */
  it("L3: a network error on /logout reports failed, never signed-out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
        return Promise.reject(new TypeError("Failed to fetch"));
      })
    );

    await expect(performLogoutRequest()).resolves.toBe("failed");
  });

  /** L4: a 500 never fabricates "signed out". */
  it("L4: a 500 from /logout reports failed, never signed-out", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetchMock({
        logoutResponses: [() => new Response(JSON.stringify({ message: "boom" }), { status: 500 })],
      })
    );

    await expect(performLogoutRequest()).resolves.toBe("failed");
  });

  /** L6: a later retry (a fresh call to performLogoutRequest) can still succeed. */
  it("L6: a later retry that succeeds signs the user out", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetchMock({
        logoutResponses: [() => new Response(JSON.stringify({ message: "boom" }), { status: 500 })],
      })
    );
    await expect(performLogoutRequest()).resolves.toBe("failed");
    vi.unstubAllGlobals();

    vi.stubGlobal("fetch", routedFetchMock({ logoutResponses: [() => new Response(null, { status: 204 })] }));
    await expect(performLogoutRequest()).resolves.toBe("signed-out");
  });

  /** L7: a 419 is retried at most once (fresh CSRF cookie + one more /logout attempt). */
  it("L7: a single 419 is retried once and signs out on that retry's success", async () => {
    const fetchMock = routedFetchMock({
      logoutResponses: [
        () => new Response(JSON.stringify({ message: "CSRF token mismatch." }), { status: 419 }),
        () => new Response(null, { status: 204 }),
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(performLogoutRequest()).resolves.toBe("signed-out");

    const logoutCalls = fetchMock.mock.calls.filter((call: unknown[]) => String(call[0]).includes("/api/v1/logout"));
    expect(logoutCalls).toHaveLength(2);
  });

  /** L8: 419 persists through the retry, and /me confirms the session is still alive -> failed, never signed-out. */
  it("L8: persistent 419 + /me=200 stays authenticated (reports failed)", async () => {
    const fetchMock = routedFetchMock({
      logoutResponses: [
        () => new Response(JSON.stringify({ message: "CSRF token mismatch." }), { status: 419 }),
        () => new Response(JSON.stringify({ message: "CSRF token mismatch." }), { status: 419 }),
      ],
      meResponse: () =>
        new Response(
          JSON.stringify({
            user: { id: "u1", name: "A", email: "a@b.com", phone: null },
            memberships: [],
            active_company: null,
            requires_company_selection: false,
          }),
          { status: 200 }
        ),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(performLogoutRequest()).resolves.toBe("failed");

    const meCalls = fetchMock.mock.calls.filter((call: unknown[]) => String(call[0]).includes("/api/v1/me"));
    expect(meCalls).toHaveLength(1);
  });

  /** L9: 419 persists through the retry, but /me confirms no session -> signed-out. */
  it("L9: persistent 419 + /me=401 signs out", async () => {
    const fetchMock = routedFetchMock({
      logoutResponses: [
        () => new Response(JSON.stringify({ message: "CSRF token mismatch." }), { status: 419 }),
        () => new Response(JSON.stringify({ message: "CSRF token mismatch." }), { status: 419 }),
      ],
      meResponse: () => new Response(JSON.stringify({ message: "Unauthenticated." }), { status: 401 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(performLogoutRequest()).resolves.toBe("signed-out");
  });

  it("never loops past the single 419 retry + one /me check (no infinite retry)", async () => {
    const fetchMock = routedFetchMock({
      logoutResponses: [
        () => new Response(JSON.stringify({ message: "CSRF token mismatch." }), { status: 419 }),
        () => new Response(JSON.stringify({ message: "CSRF token mismatch." }), { status: 419 }),
      ],
      meResponse: () => new Response(JSON.stringify({ message: "Unauthenticated." }), { status: 401 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await performLogoutRequest();

    // 2 csrf-cookie + 2 logout + 1 me = 5 total fetch calls, never more.
    expect(fetchMock.mock.calls.length).toBe(5);
  });
});
