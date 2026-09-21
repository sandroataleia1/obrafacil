"use client";

/**
 * SUPPLY-FRONTEND-01A §16. Async replacement for the deleted
 * `prototype/use-material.ts`. Same contract/tenant-safety discipline as
 * `features/projects/use-project.ts`: `undefined` = loading, `null` =
 * 404 real, `error: true` = network/500 distinct from not-found. State
 * tagged with `{companyId, id}`, `activeCompanyIdRef` written via
 * `useLayoutEffect` so a microtask-resolved promise continuation for the
 * old company/id can never mistake itself for current.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { getMaterial } from "./materials-client";
import type { Material } from "./types";

interface LoadedMaterial {
  companyId: string | undefined;
  id: string;
  material: Material | null;
}

export function useMaterial(id: string): {
  material: Material | null | undefined;
  error: boolean;
  reload: () => void;
} {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [loaded, setLoaded] = useState<LoadedMaterial | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  const idRef = useRef(id);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    idRef.current = id;
  }, [activeCompanyId, id]);

  const load = useCallback(() => {
    if (id === "") return;
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    const requestMaterialId = id;
    setErrorKey(null);
    getMaterial(id)
      .then((data) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId || idRef.current !== requestMaterialId) return;
        setLoaded({ companyId: requestCompanyId, id: requestMaterialId, material: data });
      })
      .catch((error: unknown) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId || idRef.current !== requestMaterialId) return;
        if (error instanceof ApiError && error.status === 404) {
          setLoaded({ companyId: requestCompanyId, id: requestMaterialId, material: null });
          return;
        }
        setErrorKey(`${requestCompanyId ?? ""}:${requestMaterialId}`);
      });
  }, [id, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant = loaded !== null && loaded.companyId === activeCompanyId && loaded.id === id;
  const material = isCurrentTenant ? loaded.material : undefined;
  const error = errorKey === `${activeCompanyId ?? ""}:${id}`;

  return { material, error, reload: load };
}
