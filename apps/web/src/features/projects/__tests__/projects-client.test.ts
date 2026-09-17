import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, ApiValidationError } from "@/lib/api-client";
import { createProject, getProject, listAllProjectsFromApi, listProjects, updateProject } from "../projects-client";
import type { ProjectCreatePayload, ProjectUpdatePayload } from "../types";

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

function emptyPage(overrides: Partial<{ current_page: number; last_page: number; total: number }> = {}) {
  return {
    data: [],
    meta: { current_page: 1, from: null, last_page: 1, per_page: 100, to: null, total: 0, ...overrides },
    links: { first: null, last: null, prev: null, next: null },
  };
}

const minimalPayload: ProjectCreatePayload = {
  name: "Casa Oliveira",
  customer_id: "cust-1",
};

describe("projects-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PJ1: listProjects sends page/per_page/search/status as query params", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse(emptyPage()));
    vi.stubGlobal("fetch", fetchMock);

    await listProjects({ search: "Casa", page: 2, perPage: 15, status: "planning" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v1/projects?");
    expect(String(url)).toContain("search=Casa");
    expect(String(url)).toContain("page=2");
    expect(String(url)).toContain("per_page=15");
    expect(String(url)).toContain("status=planning");
    expect(init!.method).toBe("GET");
  });

  it("PJ2: listProjects omits search/status when not provided", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse(emptyPage()));
    vi.stubGlobal("fetch", fetchMock);

    await listProjects({ page: 1, perPage: 15 });

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain("search=");
    expect(String(url)).not.toContain("status=");
  });

  it("PJ3: listProjects with only a status filter still fires (backend-side search)", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse(emptyPage()));
    vi.stubGlobal("fetch", fetchMock);

    await listProjects({ status: "completed", page: 1, perPage: 15 });

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("status=completed");
  });

  it("PJ4: listProjects sends per_page as given (pagination contract, not client-side slicing)", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse(emptyPage({ last_page: 3, total: 45 })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listProjects({ page: 1, perPage: 15 });

    expect(result.meta.last_page).toBe(3);
    expect(result.meta.total).toBe(45);
  });

  it("PJ5: getProject sends GET to /projects/{id}", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "proj-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await getProject("proj-1");

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v1/projects/proj-1");
  });

  it("PJ5b: getProject propagates a 404 as ApiError", async () => {
    const fetchMock: FetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProject("missing")).rejects.toBeInstanceOf(ApiError);
  });

  it("PJ6: createProject POSTs the exact payload shape", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "new-proj", number: "OBR-000001" }, 201));

    await createProject(minimalPayload);

    const call = mutatingCall(fetchMock);
    expect(call[1]!.method).toBe("POST");
    expect(String(call[0])).toContain("/api/v1/projects");
    expect(JSON.parse(call[1]!.body!)).toEqual(minimalPayload);
  });

  it("PJ7: createProject propagates a 422 as ApiValidationError", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ errors: { name: ["O campo nome é obrigatório."] } }, 422));
    void fetchMock;

    await expect(createProject(minimalPayload)).rejects.toBeInstanceOf(ApiValidationError);
  });

  it("PJ8: createProject payload never contains hostile fields (id/company_id/number/status/timestamps)", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "new-proj", number: "OBR-000001" }, 201));

    await createProject(minimalPayload);

    const call = mutatingCall(fetchMock);
    const body = JSON.parse(call[1]!.body!);
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("company_id");
    expect(body).not.toHaveProperty("number");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("created_at");
    expect(body).not.toHaveProperty("updated_at");
  });

  const updatePayload: ProjectUpdatePayload = {
    updated_at: "2026-09-01T10:00:00.000000Z",
    name: "Casa Oliveira Reformada",
  };

  it("PJ9: updateProject PUTs to /projects/{id} and always carries updated_at", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "proj-1", updated_at: "2026-09-01T10:05:00.000000Z" }));

    await updateProject("proj-1", updatePayload);

    const call = mutatingCall(fetchMock);
    expect(call[1]!.method).toBe("PUT");
    expect(String(call[0])).toContain("/api/v1/projects/proj-1");
    const body = JSON.parse(call[1]!.body!);
    expect(body.updated_at).toBe("2026-09-01T10:00:00.000000Z");
  });

  it("PJ9b: updateProject payload never contains source_budget_id", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ id: "proj-1" }));

    await updateProject("proj-1", updatePayload);

    const call = mutatingCall(fetchMock);
    const body = JSON.parse(call[1]!.body!);
    expect(body).not.toHaveProperty("source_budget_id");
  });

  it("PJ9c: updateProject propagates a 409 as ApiError", async () => {
    const fetchMock = stubMutatingFetch(jsonResponse({ message: "Conflict" }, 409));
    void fetchMock;

    await expect(updateProject("proj-1", updatePayload)).rejects.toBeInstanceOf(ApiError);
  });

  it("PJ10: there is no deleteProject function anywhere in this client", async () => {
    const client = await import("../projects-client");
    expect("deleteProject" in client).toBe(false);
  });

  it("listAllProjectsFromApi pages internally until last_page, never truncating past 100", async () => {
    const page1 = {
      data: [{ id: "p1" }, { id: "p2" }],
      meta: { current_page: 1, from: 1, last_page: 2, per_page: 100, to: 2, total: 150 },
      links: { first: null, last: null, prev: null, next: null },
    };
    const page2 = {
      data: [{ id: "p3" }],
      meta: { current_page: 2, from: 3, last_page: 2, per_page: 100, to: 3, total: 150 },
      links: { first: null, last: null, prev: null, next: null },
    };
    const fetchMock: FetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page1))
      .mockResolvedValueOnce(jsonResponse(page2));
    vi.stubGlobal("fetch", fetchMock);

    const all = await listAllProjectsFromApi();

    expect(all.map((project) => project.id)).toEqual(["p1", "p2", "p3"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
