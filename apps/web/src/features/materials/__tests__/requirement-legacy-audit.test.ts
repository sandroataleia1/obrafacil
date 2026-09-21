import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SUPPLY-FRONTEND-01B §37-38/§60. MaterialRequirement itself is real API
 * now — this proves the MIGRATED call sites never read/write the legacy
 * `obrafacil:material-requirements`/`:deleted` keys and never import the
 * removed prototype modules (`prototype/material-requirement`,
 * `prototype/use-requirement`, `prototype/use-requirements` — all three
 * deleted this gate, zero remaining consumers).
 *
 * This is DELIBERATELY NOT a global "zero runtime usage of the keys"
 * claim — `prototype/material-requirement-store.ts` itself still reads/
 * writes them, because three explicitly OUT-OF-SCOPE local consumers
 * still depend on it: the Dashboard executive panel
 * (`features/dashboard/prototype/use-executive-panel.ts`), the Obra
 * detail widget (`features/projects/project-detail.tsx`), and Stock's
 * `features/stock/prototype/supply-metrics.ts` projection — see
 * `prototype/legacy-types.ts`'s doc comment for the full rationale
 * (mirrors the pre-existing `Budget`/`legacy-types.ts` pattern). Backup/
 * reset (`pilot-backup-keys.ts`/`pilot-reset.ts`) deliberately still list
 * these keys for the same reason.
 */
const FORBIDDEN_KEY_PATTERNS = [
  'localStorage.getItem("obrafacil:material-requirements")',
  'localStorage.setItem("obrafacil:material-requirements"',
  'localStorage.getItem("obrafacil:material-requirements:deleted")',
  'localStorage.setItem("obrafacil:material-requirements:deleted"',
];

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["'].*prototype\/material-requirement["']/,
  /from\s+["'].*prototype\/use-requirement["']/,
  /from\s+["'].*prototype\/use-requirements["']/,
];

const MIGRATED_FILES = [
  "../requirement-form.tsx",
  "../project-requirement-list.tsx",
  "../prototype/material-local-dependencies.ts",
  "../use-material-requirements.ts",
  "../use-material-requirement.ts",
  "../material-requirements-client.ts",
];

describe("MaterialRequirement legacy audit — SUPPLY-FRONTEND-01B §37-38 (TG5-TG6)", () => {
  it("TG6: the migrated Requirement call sites never read/write the legacy localStorage keys and never import the removed prototype modules", () => {
    const offenders: string[] = [];

    for (const relativePath of MIGRATED_FILES) {
      const fullPath = join(__dirname, relativePath);
      const content = readFileSync(fullPath, "utf-8");
      for (const pattern of FORBIDDEN_KEY_PATTERNS) {
        if (content.includes(pattern)) offenders.push(`${relativePath}: ${pattern}`);
      }
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        if (pattern.test(content)) offenders.push(`${relativePath}: ${pattern}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("the three zero-consumer prototype files were actually deleted, not just unlinked", () => {
    const removed = [
      join(__dirname, "../prototype/material-requirement.ts"),
      join(__dirname, "../prototype/use-requirement.ts"),
      join(__dirname, "../prototype/use-requirements.ts"),
    ];
    for (const path of removed) {
      expect(() => readFileSync(path, "utf-8")).toThrow();
    }
  });
});
