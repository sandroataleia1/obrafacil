/**
 * Presentation-only timing helpers (Pilot-Ready "Sistema de Loading").
 * Two distinct minimums for two distinct experiences: auth moments
 * (BrandMark) get a longer, perceptible duration; routine page
 * navigation (Skeleton) gets a short one just long enough to avoid a
 * flash on fast localStorage reads. Never use these to delay actual
 * domain/auth/store work — call them only around the UI transition,
 * after the real operation has already finished.
 */
export const MIN_LOGIN_LOADING_MS = 500;
export const MIN_PAGE_SKELETON_MS = 250;

export async function ensureMinimumVisualDuration(startedAt: number, minMs: number): Promise<void> {
  const elapsed = performance.now() - startedAt;
  const remaining = minMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
