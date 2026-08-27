const FOCUSED_FLOW_PREFIXES = [
  "/calcular/alvenaria",
  "/calcular/forro",
  "/calcular/laje",
  "/calcular/piso",
];

/**
 * Focused flows (multi-step calculators) hide the global mobile bottom
 * navigation so the flow can behave like a dedicated task instead of
 * competing with the app's primary navigation.
 */
export function isFocusedFlowRoute(pathname: string): boolean {
  return FOCUSED_FLOW_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
