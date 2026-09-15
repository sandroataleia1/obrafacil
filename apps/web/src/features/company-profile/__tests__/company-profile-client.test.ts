import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteCompanyLogo, getCompanyProfile, updateCompanyProfile, uploadCompanyLogo } from "../company-profile-client";
import type { CompanyProfileUpdatePayload } from "../types";

function routedFetchMock(overrides: Record<string, () => Response> = {}) {
  return vi.fn().mockImplementation((url: string) => {
    for (const [match, respond] of Object.entries(overrides)) {
      if (url.includes(match)) return Promise.resolve(respond());
    }
    if (url.includes("csrf-cookie")) return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });
}

const FULL_PAYLOAD: CompanyProfileUpdatePayload = {
  name: "Construtora X",
  legal_name: "Construtora X LTDA",
  trade_name: "X Construções",
  document: "11222333000181",
  phone: "+5511987654321",
  whatsapp: "+5511987654322",
  email: "contato@x.com",
  postal_code: "01001000",
  street: "Praça da Sé",
  number: "100",
  complement: null,
  neighborhood: "Sé",
  city: "São Paulo",
  state: "SP",
  reference_point: null,
  timezone: "America/Sao_Paulo",
};

describe("company-profile-client (FRONTEND-COMPANY-PROFILE-01 §10 PC1-PC8)", () => {
  beforeEach(() => {
    document.cookie = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** PC1: GET hits the exact profile path. */
  it("PC1: getCompanyProfile GETs /api/v1/company/profile", async () => {
    const fetchMock = routedFetchMock({
      "/api/v1/company/profile": () => new Response(JSON.stringify({ id: "c1" }), { status: 200 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getCompanyProfile();

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/company/profile"))!;
    expect(call[0]).toContain("/api/v1/company/profile");
    expect(call[1].method ?? "GET").toBe("GET");
  });

  /** PC2: PUT hits the exact profile path with method PUT. */
  it("PC2: updateCompanyProfile PUTs /api/v1/company/profile", async () => {
    const fetchMock = routedFetchMock({
      "/api/v1/company/profile": () => new Response(JSON.stringify({ id: "c1" }), { status: 200 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateCompanyProfile(FULL_PAYLOAD);

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/company/profile"))!;
    expect(call[0]).toContain("/api/v1/company/profile");
    expect(call[1].method).toBe("PUT");
  });

  /** PC3: the PUT body has the flat address fields (postal_code/street/... at top level). */
  it("PC3: PUT body has flat address fields", async () => {
    const fetchMock = routedFetchMock({
      "/api/v1/company/profile": () => new Response(JSON.stringify({ id: "c1" }), { status: 200 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateCompanyProfile(FULL_PAYLOAD);

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/company/profile"))!;
    const body = JSON.parse(call[1].body);
    expect(body.postal_code).toBe("01001000");
    expect(body.street).toBe("Praça da Sé");
    expect(body.city).toBe("São Paulo");
    expect(body.state).toBe("SP");
  });

  /** PC4: the PUT body never sends a nested `address` key. */
  it("PC4: PUT body never sends a nested address object", async () => {
    const fetchMock = routedFetchMock({
      "/api/v1/company/profile": () => new Response(JSON.stringify({ id: "c1" }), { status: 200 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateCompanyProfile(FULL_PAYLOAD);

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/company/profile"))!;
    const body = JSON.parse(call[1].body);
    expect(body).not.toHaveProperty("address");
  });

  /** PC5: logo upload sends a FormData body with key "logo". */
  it("PC5: uploadCompanyLogo sends FormData with key 'logo'", async () => {
    const fetchMock = routedFetchMock({
      "/logo": () => new Response(JSON.stringify({ id: "c1" }), { status: 200 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["fake"], "logo.png", { type: "image/png" });
    await uploadCompanyLogo(file);

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/logo"))!;
    expect(call[1].body).toBeInstanceOf(FormData);
    const form = call[1].body as FormData;
    expect(form.get("logo")).toBe(file);
    expect(call[1].method).toBe("POST");
    expect(call[0]).toContain("/api/v1/company/profile/logo");
  });

  /** PC6: delete hits the exact logo path with method DELETE. */
  it("PC6: deleteCompanyLogo DELETEs /api/v1/company/profile/logo", async () => {
    const fetchMock = routedFetchMock({
      "/logo": () => new Response(JSON.stringify({ id: "c1" }), { status: 200 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await deleteCompanyLogo();

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/logo"))!;
    expect(call[0]).toContain("/api/v1/company/profile/logo");
    expect(call[1].method).toBe("DELETE");
  });

  /** PC7: no client function ever sends a company_id anywhere in path/body. */
  it("PC7: no client function ever sends company_id", async () => {
    const fetchMock = routedFetchMock({
      "/api/v1/company/profile": () => new Response(JSON.stringify({ id: "c1" }), { status: 200 }),
      "/logo": () => new Response(JSON.stringify({ id: "c1" }), { status: 200 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getCompanyProfile();
    await updateCompanyProfile(FULL_PAYLOAD);
    await deleteCompanyLogo();

    for (const call of fetchMock.mock.calls) {
      const url = String(call[0]);
      expect(url).not.toContain("company_id");
      if (typeof call[1]?.body === "string") {
        expect(call[1].body).not.toContain("company_id");
      }
    }
  });

  /** PC8: no client function ever sends logo_path. */
  it("PC8: PUT body never sends logo_path", async () => {
    const fetchMock = routedFetchMock({
      "/api/v1/company/profile": () => new Response(JSON.stringify({ id: "c1" }), { status: 200 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateCompanyProfile(FULL_PAYLOAD);

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/company/profile"))!;
    const body = JSON.parse(call[1].body);
    expect(body).not.toHaveProperty("logo_path");
    expect(body).not.toHaveProperty("logo_url");
  });
});
