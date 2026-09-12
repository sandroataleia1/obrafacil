"use client";

import { useLayoutEffect, useRef } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { CustomerCreateWizard } from "./customer-create-wizard";

/**
 * Thin tenant-reset wrapper around the actual 4-step wizard
 * (`CustomerCreateWizard`). `key={activeCompanyId}` forces a full
 * unmount+remount of the wizard on any company switch — every piece of
 * in-progress wizard state (name, addresses, contacts, an in-flight CNPJ
 * lookup) is destroyed instantly, and no callback belonging to the OLD
 * instance can touch the fresh one's state (there is no fresh instance's
 * state for it to touch — it's a brand-new component tree).
 *
 * That alone does not stop the OLD instance's own dangling promise
 * continuation from firing `router.push(...)` after it unmounts, though —
 * `router.push` is a global side effect, not tied to component lifecycle.
 * `activeCompanyIdRef` is created HERE, in this wrapper, which never
 * unmounts across a tenant switch — only its child does. The wizard
 * captures this SAME ref object in its closures; even after the wizard
 * instance is gone, this wrapper keeps updating `.current` on every
 * switch, so a stale continuation reading `.current` at resolution time
 * always sees the truth, never a value frozen at a dead instance's last
 * render.
 *
 * The assignment happens in a `useLayoutEffect`, not a `useEffect`. Both
 * fire after render, but `useEffect` (a "passive" effect) is scheduled
 * for AFTER the browser paints — a separate task, with a real window
 * after commit where a dangling `createCustomer` promise from the OLD
 * instance could resolve and still see the stale company id. A layout
 * effect runs synchronously right after commit (unmounting the OLD
 * wizard, mounting the NEW one under the new `key`), in the very same
 * synchronous block — no microtask (a resolved promise's `.then`) can
 * run in between. That closes the window completely, without mutating a
 * ref during render itself (react-hooks/refs forbids that).
 */
export function CustomerCreateForm() {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  return <CustomerCreateWizard key={activeCompanyId} activeCompanyIdRef={activeCompanyIdRef} />;
}
