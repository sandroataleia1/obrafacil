"use client";

/**
 * Async replacement for the deleted `prototype/use-project.ts`, hardened
 * by FRONTEND-PROJECTS-01A §10-11. Every existing secondary consumer
 * (Equipe pages, etc.) keeps importing `project`/`reload` unchanged —
 * `undefined` = loading, `null` = not-found. A NEW `error: boolean` field
 * distinguishes a real fetch failure from "not found" (§11) without
 * breaking any existing consumer that only destructures `project`.
 * `ProjectDetail` itself does NOT use this hook — it has its own richer
 * loading/404/error/retry states, mirroring `ServiceOrderDetail`.
 *
 * Same tenant-safety discipline as `useAllProjects` (§10): state is
 * tagged with `{companyId, id}` (not just `companyId`) so a `id` change
 * on the SAME company also fails closed in the same render; the live
 * ref is written via `useLayoutEffect` so a microtask-resolved promise
 * continuation for the old company/id can never mistake itself for
 * current.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { getProject } from "./projects-client";
import type { Project } from "./types";

interface LoadedProject {
  companyId: string | undefined;
  id: string;
  project: Project | null;
}

export function useProject(id: string): {
  project: Project | null | undefined;
  error: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [loaded, setLoaded] = useState<LoadedProject | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  const idRef = useRef(id);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    idRef.current = id;
  }, [activeCompanyId, id]);

  const load = useCallback(() => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    const requestProjectId = id;
    setErrorKey(null);
    getProject(id)
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId || idRef.current !== requestProjectId) return;
        setLoaded({ companyId: requestCompanyId, id: requestProjectId, project: data });
      })
      .catch((error: unknown) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId || idRef.current !== requestProjectId) return;
        if (error instanceof ApiError && error.status === 404) {
          setLoaded({ companyId: requestCompanyId, id: requestProjectId, project: null });
          return;
        }
        setErrorKey(`${requestCompanyId ?? ""}:${requestProjectId}`);
      });
  }, [id, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant = loaded !== null && loaded.companyId === activeCompanyId && loaded.id === id;
  const project = isCurrentTenant ? loaded.project : undefined;
  const error = errorKey === `${activeCompanyId ?? ""}:${id}`;

  return { project, error, reload: load };
}
