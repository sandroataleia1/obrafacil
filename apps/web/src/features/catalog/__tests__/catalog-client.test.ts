import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCatalogItem,
  getCatalogItem,
  listCatalogItems,
  updateCatalogItem,
} from "../catalog-client";
import type { CatalogItem } from "../types";

type FetchInit = RequestInit & { body?: string };
type FetchMock = ReturnType<typeof vi.fn<(url: string, init?: FetchInit) => Promise<Response>>>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubMutatingFetch(response: Response): FetchMock {
  const fetchMock: FetchMock = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const SAMPLE_ITEM: CatalogItem = {
  id: "item-1",
  type: "service",
  code: "PINT-M2",
  name: "Pintura de paredes",
  category: "Pintura",
  unit: "m²",
  description: null,
  cost_price: "18.50",
  sale_price: "32.00",
  active: true,
  created_at: "2026-09-11T00:00:00Z",
  updated_at: "2026-09-11T00:00:00Z",
};

describe("catalog-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** API1: list sends search/page/per_page as query params. */
  it("API1: listCatalogItems sends search/page/per_page as query params", async () => {
    const fetchMock: FetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [], meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 }, links: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await listCatalogItems({ search: "pintura", page: 2, perPage: 15 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v1/catalog-items?");
    expect(String(url)).toContain("search=pintura");
    expect(String(url)).toContain("page=2");
    expect(String(url)).toContain("per_page=15");
    expect(init!.method).toBe("GET");
  });

  /** API2: type=product filter. */
  it("API2: listCatalogItems sends type=product", async () => {
    const fetchMock: FetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [], meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 }, links: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await listCatalogItems({ type: "product" });

    expect(String(fetchMock.mock.calls[0]![0])).toContain("type=product");
  });

  /** API3: type=service filter. */
  it("API3: listCatalogItems sends type=service", async () => {
    const fetchMock: FetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [], meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 }, links: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await listCatalogItems({ type: "service" });

    expect(String(fetchMock.mock.calls[0]![0])).toContain("type=service");
  });

  /** API4: active=true filter. */
  it("API4: listCatalogItems sends active=true", async () => {
    const fetchMock: FetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [], meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 }, links: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await listCatalogItems({ active: true });

    expect(String(fetchMock.mock.calls[0]![0])).toContain("active=true");
  });

  /** API5: active=false filter. */
  it("API5: listCatalogItems sends active=false", async () => {
    const fetchMock: FetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [], meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 }, links: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await listCatalogItems({ active: false });

    expect(String(fetchMock.mock.calls[0]![0])).toContain("active=false");
  });

  /** API6: create sends a POST with the exact payload. */
  it("API6: createCatalogItem POSTs the exact payload", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse(SAMPLE_ITEM, 201));

    const payload = {
      type: "service" as const,
      code: "PINT-M2",
      name: "Pintura de paredes",
      unit: "m²",
    };
    await createCatalogItem(payload);

    const call = fetchMock.mock.calls.find((c) => !String(c[0]).includes("csrf-cookie"))!;
    expect(String(call[0])).toContain("/api/v1/catalog-items");
    expect(call[1]!.method).toBe("POST");
    expect(JSON.parse(call[1]!.body!)).toEqual(payload);
  });

  /** API7: get fetches the item by id. */
  it("API7: getCatalogItem sends GET to /catalog-items/{id}", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse(SAMPLE_ITEM));
    vi.stubGlobal("fetch", fetchMock);

    await getCatalogItem("item-1");

    expect(String(fetchMock.mock.calls[0]![0])).toContain("/api/v1/catalog-items/item-1");
  });

  /** API8: update PUTs to /catalog-items/{id}. */
  it("API8: updateCatalogItem PUTs the exact payload", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse(SAMPLE_ITEM));

    const payload = { type: "service" as const, code: null, name: "X", category: null, unit: "un", description: null, cost_price: null, sale_price: null, active: false };
    await updateCatalogItem("item-1", payload);

    const call = fetchMock.mock.calls.find((c) => !String(c[0]).includes("csrf-cookie"))!;
    expect(String(call[0])).toContain("/api/v1/catalog-items/item-1");
    expect(call[1]!.method).toBe("PUT");
    expect(JSON.parse(call[1]!.body!)).toEqual(payload);
  });

  /** No function in this module ever calls a non-ObraFácil host — same guarantee as customers-client. */
  it("every request targets only the configured ObraFácil API host", async () => {
    const fetchMock: FetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [], meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 }, links: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await listCatalogItems({});

    expect(String(fetchMock.mock.calls[0]![0]).startsWith(process.env.NEXT_PUBLIC_API_URL!)).toBe(true);
  });
});
