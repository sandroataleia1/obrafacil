"use client";

/**
 * FRONTEND-PROJECTS-01 §6/§47, hardened by FRONTEND-PROJECTS-01A §2-8.
 * Async replacement for the deleted `prototype/project-store.ts`'s
 * `listAllProjects()` — every dependent module that needs the full set of
 * Obras for a selector/dropdown or a per-row "resolve this projectId's
 * name" lookup (never the main `/obras` list, which paginates
 * server-side) goes through here. Backed by `listAllProjectsFromApi()`
 * (pages internally, never silently truncates past 100).
 *
 * Tenant-safety discipline (§2-5):
 * - State is TAGGED with the `companyId` it was loaded for (`loaded`),
 *   never a bare `ProjectListItem[]` — the public `projects` value is
 *   only ever derived from `loaded` when `loaded.companyId ===
 *   activeCompanyId`, so a Company switch hides A's data in the SAME
 *   render as the switch, not one effect-tick later.
 * - `activeCompanyIdRef` is written in `useLayoutEffect`, not
 *   `useEffect` — a promise continuation for the OLD company that
 *   resolves as a microtask (which can run between commit and passive
 *   effects) must see the NEW company id already, or it would wrongly
 *   conclude it's still current.
 * - Each `load()` call captures its own `requestId`/`requestCompanyId`;
 *   a success/error only applies if both the sequence AND the live ref
 *   still match at resolution time — this also protects
 *   `listAllProjectsFromApi()`'s internal multi-page loop: since the
 *   whole helper resolves as ONE promise, a Company switch mid-pagination
 *   simply causes the eventual combined result to be discarded, never
 *   partially-committed page-by-page.
 *
 * Error contract (§8): a real fetch failure (network/500) is exposed as
 * `error: true`, never silently collapsed into `projects: []` — a
 * caller must never mistake "the API is down" for "this Company has no
 * Obras yet". `undefined` = loading, `[]` = loaded and genuinely empty,
 * `error: true` = the load failed and `projects` stays `undefined`.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { listAllProjectsFromApi } from "./projects-client";
import type { ProjectListItem } from "./types";

interface LoadedProjects {
  companyId: string | undefined;
  projects: ProjectListItem[];
}

export function useAllProjects(): {
  projects: ProjectListItem[] | undefined;
  error: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [loaded, setLoaded] = useState<LoadedProjects | null>(null);
  const [errorCompanyId, setErrorCompanyId] = useState<string | undefined>(undefined);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const load = useCallback(() => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    setErrorCompanyId(undefined);
    listAllProjectsFromApi()
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setLoaded({ companyId: requestCompanyId, projects: data });
      })
      .catch(() => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setErrorCompanyId(requestCompanyId);
      });
  }, [activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant = loaded !== null && loaded.companyId === activeCompanyId;
  const projects = isCurrentTenant ? loaded.projects : undefined;
  const error = errorCompanyId === activeCompanyId;

  return { projects, error, reload: load };
}
