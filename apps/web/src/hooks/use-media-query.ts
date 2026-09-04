"use client";

import { useEffect, useState } from "react";

/**
 * `matches` starts `false` and is only ever set from `useEffect`, so
 * the server render and the initial client hydration render always
 * agree (both render the "server" branch of whatever depends on this
 * hook) — no hydration mismatch, at the cost of one extra paint after
 * mount to pick up the real viewport width. Matches the same
 * loading-then-settling pattern already used by the store hooks
 * (e.g. `useEmployees`) elsewhere in this codebase.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMatches(mediaQueryList.matches);

    function handleChange(event: MediaQueryListEvent) {
      setMatches(event.matches);
    }

    mediaQueryList.addEventListener("change", handleChange);
    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}
