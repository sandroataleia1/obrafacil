import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Default for every test — lib/api-client.ts throws at module-evaluation
// time if this is absent (Gate FRONTEND-AUTH-01A §5/§15). Tests that
// specifically exercise that absence (C2) delete/restore it themselves
// around a fresh dynamic import.
process.env.NEXT_PUBLIC_API_URL ??= "http://localhost:8000";

afterEach(() => {
  cleanup();
});
