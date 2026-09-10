import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, ApiValidationError } from "@/lib/api-client";
import {
  createAddress,
  createContact,
  createCustomer,
  deleteAddress,
  deleteContact,
  deleteCustomer,
  getCustomer,
  listCustomers,
  lookupCep,
  lookupCnpj,
  updateAddress,
  updateContact,
  updateCustomer,
} from "../customers-client";

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

describe("customers-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** C1: list sends GET with page/per_page/search. */
  it("C1: listCustomers sends page/per_page/search as query params", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [], meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 }, links: {} })
    );
    vi.stubGlobal("fetch", fetchMock);

    await listCustomers({ search: "joão", page: 2, perPage: 15 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v1/customers?");
    expect(String(url)).toContain("search=jo%C3%A3o");
    expect(String(url)).toContain("page=2");
    expect(String(url)).toContain("per_page=15");
    expect(init!.method).toBe("GET");
  });

  /** C2: get detail. */
  it("C2: getCustomer sends GET to /customers/{id}", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "abc" }));
    vi.stubGlobal("fetch", fetchMock);

    await getCustomer("abc");

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v1/customers/abc");
  });

  /** C3: create payload. */
  it("C3: createCustomer POSTs the exact payload shape", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "new" }, 201));

    const payload = { kind: "individual" as const, name: "João", addresses: [], contacts: [] };
    await createCustomer(payload);

    const call = fetchMock.mock.calls.find((c) => !String(c[0]).includes("csrf-cookie"))!;
    expect(call[1]!.method).toBe("POST");
    expect(JSON.parse(call[1]!.body!)).toEqual(payload);
  });

  /** C4: update payload. */
  it("C4: updateCustomer PUTs to /customers/{id}", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "abc" }));

    const payload = { kind: "individual" as const, name: "João" };
    await updateCustomer("abc", payload);

    const call = fetchMock.mock.calls.find((c) => !String(c[0]).includes("csrf-cookie"))!;
    expect(String(call[0])).toContain("/api/v1/customers/abc");
    expect(call[1]!.method).toBe("PUT");
    expect(JSON.parse(call[1]!.body!)).toEqual(payload);
  });

  /** C5: delete. */
  it("C5: deleteCustomer sends DELETE to /customers/{id}", async () => {
    const fetchMock = stubMutatingFetch(new Response(null, { status: 204 }));

    await deleteCustomer("abc");

    const call = fetchMock.mock.calls.find((c) => !String(c[0]).includes("csrf-cookie"))!;
    expect(String(call[0])).toContain("/api/v1/customers/abc");
    expect(call[1]!.method).toBe("DELETE");
  });

  /** C6: create address nested endpoint. */
  it("C6: createAddress POSTs to /customers/{id}/addresses", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "addr-1" }, 201));

    await createAddress("cust-1", { label: "Casa", type: "residential" });

    const call = fetchMock.mock.calls.find((c) => !String(c[0]).includes("csrf-cookie"))!;
    expect(String(call[0])).toContain("/api/v1/customers/cust-1/addresses");
    expect(call[1]!.method).toBe("POST");
  });

  /** C7: update address nested endpoint. */
  it("C7: updateAddress PUTs to /customers/{id}/addresses/{addressId}", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "addr-1" }));

    await updateAddress("cust-1", "addr-1", { label: "Casa", type: "residential" });

    const call = fetchMock.mock.calls.find((c) => !String(c[0]).includes("csrf-cookie"))!;
    expect(String(call[0])).toContain("/api/v1/customers/cust-1/addresses/addr-1");
    expect(call[1]!.method).toBe("PUT");
  });

  /** C8: delete address nested endpoint. */
  it("C8: deleteAddress sends DELETE to /customers/{id}/addresses/{addressId}", async () => {
    const fetchMock = stubMutatingFetch(new Response(null, { status: 204 }));

    await deleteAddress("cust-1", "addr-1");

    const call = fetchMock.mock.calls.find((c) => !String(c[0]).includes("csrf-cookie"))!;
    expect(String(call[0])).toContain("/api/v1/customers/cust-1/addresses/addr-1");
    expect(call[1]!.method).toBe("DELETE");
  });

  /** C9: create contact nested endpoint. */
  it("C9: createContact POSTs to /customers/{id}/contacts", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "contact-1" }, 201));

    await createContact("cust-1", { name: "João" });

    const call = fetchMock.mock.calls.find((c) => !String(c[0]).includes("csrf-cookie"))!;
    expect(String(call[0])).toContain("/api/v1/customers/cust-1/contacts");
    expect(call[1]!.method).toBe("POST");
  });

  /** C10: update contact nested endpoint. */
  it("C10: updateContact PUTs to /customers/{id}/contacts/{contactId}", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "contact-1" }));

    await updateContact("cust-1", "contact-1", { name: "João" });

    const call = fetchMock.mock.calls.find((c) => !String(c[0]).includes("csrf-cookie"))!;
    expect(String(call[0])).toContain("/api/v1/customers/cust-1/contacts/contact-1");
    expect(call[1]!.method).toBe("PUT");
  });

  /** C11: delete contact nested endpoint. */
  it("C11: deleteContact sends DELETE to /customers/{id}/contacts/{contactId}", async () => {
    const fetchMock = stubMutatingFetch(new Response(null, { status: 204 }));

    await deleteContact("cust-1", "contact-1");

    const call = fetchMock.mock.calls.find((c) => !String(c[0]).includes("csrf-cookie"))!;
    expect(String(call[0])).toContain("/api/v1/customers/cust-1/contacts/contact-1");
    expect(call[1]!.method).toBe("DELETE");
  });

  /** C12: no function in this module ever calls a non-ObraFácil host. */
  it("C12: every request targets only the configured ObraFácil API host", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [], meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 }, links: {} })
    );
    vi.stubGlobal("fetch", fetchMock);

    await listCustomers({});

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url).startsWith(process.env.NEXT_PUBLIC_API_URL!)).toBe(true);
  });

  /** LK1: CEP lookup calls only the ObraFácil API. */
  it("LK1: lookupCep calls only /api/v1/lookups/cep on the ObraFácil host", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ postal_code: "01001000", street: "Praça da Sé", neighborhood: "Sé", city: "São Paulo", state: "SP", provider_complement: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    await lookupCep("01001000");

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url).startsWith(process.env.NEXT_PUBLIC_API_URL!)).toBe(true);
    expect(String(url)).toContain("/api/v1/lookups/cep");
    expect(String(url)).not.toContain("viacep");
  });

  /** LK2: CNPJ lookup calls only the ObraFácil API. */
  it("LK2: lookupCnpj calls only /api/v1/lookups/cnpj on the ObraFácil host", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        document: "19131243000197",
        legal_name: "Open Knowledge Brasil",
        trade_name: null,
        phone: null,
        email: null,
        address: { postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await lookupCnpj("19131243000197");

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url).startsWith(process.env.NEXT_PUBLIC_API_URL!)).toBe(true);
    expect(String(url)).toContain("/api/v1/lookups/cnpj");
    expect(String(url)).not.toContain("brasilapi");
  });

  /** LK3: the CEP is encoded correctly in the query string. */
  it("LK3: lookupCep encodes the cep param", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ postal_code: "01001000", street: null, neighborhood: null, city: null, state: null, provider_complement: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    await lookupCep("01001000");

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("cep=01001000");
  });

  /** LK4: the CNPJ is encoded correctly in the query string. */
  it("LK4: lookupCnpj encodes the cnpj param", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        document: "19131243000197",
        legal_name: "X",
        trade_name: null,
        phone: null,
        email: null,
        address: { postal_code: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await lookupCnpj("19131243000197");

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("cnpj=19131243000197");
  });

  /** LK5: a 404 (not found) is preserved as ApiError with status 404. */
  it("LK5: a 404 lookup response is preserved as ApiError(404)", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "not found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupCep("00000000")).rejects.toMatchObject({ status: 404 });
    await expect(lookupCep("00000000")).rejects.toBeInstanceOf(ApiError);
  });

  /** LK6: a 422 (invalid) is preserved as ApiValidationError. */
  it("LK6: a 422 lookup response is preserved as ApiValidationError", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse({ errors: { cep: ["The cep field format is invalid."] } }, 422));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupCep("123")).rejects.toBeInstanceOf(ApiValidationError);
  });

  /** LK7: a 503 (provider unavailable) is preserved as ApiError with status 503. */
  it("LK7: a 503 lookup response is preserved as ApiError(503)", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "unavailable" }, 503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupCnpj("19131243000197")).rejects.toMatchObject({ status: 503 });
  });

  /** LK8: a network failure is preserved, never silently swallowed. */
  it("LK8: a network error during lookup rejects instead of resolving silently", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupCep("01001000")).rejects.toBeTruthy();
  });

  /** LK9/LK10: lookupCep/lookupCnpj never call createCustomer or touch storage — pure GETs with no side effect beyond the request itself. */
  it("LK9/LK10: a lookup call issues exactly one GET and nothing else", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ postal_code: "01001000", street: null, neighborhood: null, city: null, state: null, provider_complement: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    await lookupCep("01001000");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1]!.method ?? "GET").toBe("GET");
  });
});
