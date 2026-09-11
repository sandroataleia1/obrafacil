import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, ApiValidationError } from "@/lib/api-client";
import {
  cancelServiceOrder,
  completeServiceOrder,
  createServiceOrder,
  getServiceOrder,
  getServiceOrderSettings,
  listServiceOrders,
  startServiceOrder,
  updateServiceOrderSettings,
} from "../service-orders-client";
import type { ServiceOrderCreatePayload } from "../types";

type FetchInit = RequestInit & { body?: string };
type FetchMock = ReturnType<typeof vi.fn<(url: string, init?: FetchInit) => Promise<Response>>>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubMutatingFetch(response: Response | ((url: string, init?: FetchInit) => Response)): FetchMock {
  const fetchMock: FetchMock = vi.fn().mockImplementation((url: string, init?: FetchInit) => {
    if (String(url).includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(typeof response === "function" ? response(String(url), init) : response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mutatingCall(fetchMock: FetchMock) {
  return fetchMock.mock.calls.find((call) => !String(call[0]).includes("csrf-cookie"))!;
}

const emptyPage = {
  data: [],
  meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 },
  links: { first: null, last: null, prev: null, next: null },
};

const minimalPayload: ServiceOrderCreatePayload = {
  customer_id: "cust-1",
  customer_address_id: "addr-1",
  customer_contact_id: null,
  responsible_user_id: null,
  title: "Reparo elétrico",
  description: null,
  scheduled_start_at: null,
  scheduled_end_at: null,
  order_discount: "0.00",
  travel_fee: "0.00",
  notes: null,
  items: [],
};

describe("service-orders-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("S1: listServiceOrders sends page/per_page/search/status as query params", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse(emptyPage));
    vi.stubGlobal("fetch", fetchMock);

    await listServiceOrders({ search: "OS-000001", page: 2, perPage: 15, status: "open" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v1/service-orders?");
    expect(String(url)).toContain("search=OS-000001");
    expect(String(url)).toContain("page=2");
    expect(String(url)).toContain("per_page=15");
    expect(String(url)).toContain("status=open");
    expect(init!.method).toBe("GET");
  });

  it("S2: listServiceOrders omits the status param when not provided", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse(emptyPage));
    vi.stubGlobal("fetch", fetchMock);

    await listServiceOrders({ page: 1, perPage: 15 });

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain("status=");
  });

  it("S3: getServiceOrder sends GET to /service-orders/{id}", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "os-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await getServiceOrder("os-1");

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v1/service-orders/os-1");
  });

  it("S4: getServiceOrder propagates a 404 as ApiError", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getServiceOrder("missing")).rejects.toBeInstanceOf(ApiError);
  });

  it("S5: createServiceOrder POSTs the exact payload shape, with no extra fields", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "new-os", number: "OS-000001" }, 201));

    await createServiceOrder(minimalPayload);

    const call = mutatingCall(fetchMock);
    expect(call[1]!.method).toBe("POST");
    expect(JSON.parse(call[1]!.body!)).toEqual(minimalPayload);
  });

  it("S6: createServiceOrder propagates a 422 as ApiValidationError with field errors", async () => {
    const fetchMock = stubMutatingFetch(
      jsonResponse({ errors: { customer_id: ["O campo customer id é obrigatório."] } }, 422)
    );
    void fetchMock;

    await expect(createServiceOrder(minimalPayload)).rejects.toBeInstanceOf(ApiValidationError);
  });

  it("S7: getServiceOrderSettings sends GET to /service-orders/settings", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse({ default_travel_fee: "0.00" }));
    vi.stubGlobal("fetch", fetchMock);

    await getServiceOrderSettings();

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v1/service-orders/settings");
  });

  it("S8: updateServiceOrderSettings PUTs the payload", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ default_travel_fee: "50.00" }));

    await updateServiceOrderSettings({ default_travel_fee: "50.00" });

    const call = mutatingCall(fetchMock);
    expect(call[1]!.method).toBe("PUT");
    expect(String(call[0])).toContain("/api/v1/service-orders/settings");
    expect(JSON.parse(call[1]!.body!)).toEqual({ default_travel_fee: "50.00" });
  });

  it("S9: startServiceOrder POSTs to /service-orders/{id}/start", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "os-1", status: "in_progress" }));

    await startServiceOrder("os-1");

    const call = mutatingCall(fetchMock);
    expect(String(call[0])).toContain("/api/v1/service-orders/os-1/start");
    expect(call[1]!.method).toBe("POST");
  });

  it("S10: completeServiceOrder POSTs to /service-orders/{id}/complete", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "os-1", status: "completed" }));

    await completeServiceOrder("os-1");

    const call = mutatingCall(fetchMock);
    expect(String(call[0])).toContain("/api/v1/service-orders/os-1/complete");
    expect(call[1]!.method).toBe("POST");
  });

  it("S11: cancelServiceOrder POSTs {reason} to /service-orders/{id}/cancel", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "os-1", status: "cancelled" }));

    await cancelServiceOrder("os-1", "Cliente desistiu");

    const call = mutatingCall(fetchMock);
    expect(String(call[0])).toContain("/api/v1/service-orders/os-1/cancel");
    expect(call[1]!.method).toBe("POST");
    expect(JSON.parse(call[1]!.body!)).toEqual({ reason: "Cliente desistiu" });
  });

  it("S12: a network failure surfaces as a distinct error, never mistaken for a validation error", async () => {
    const fetchMock: FetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getServiceOrder("os-1")).rejects.not.toBeInstanceOf(ApiValidationError);
  });
});
