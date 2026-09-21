import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SUPPLY-FRONTEND-01B1 §22-26/§30 (LE1-LE6). MaterialRequirement is
 * 100% API/PostgreSQL across the ENTIRE frontend runtime now — this is
 * the global claim SUPPLY-FRONTEND-01B could not make (it kept the
 * legacy local store alive for 3 out-of-scope consumers). This test
 * scans all of `apps/web/src` and fails on ANY runtime reference to the
 * removed legacy source: the store module, the `LegacyMaterialRequirement`
 * type, the removed mock, or the removed localStorage keys.
 */
const FORBIDDEN_KEY_PATTERNS = [
  'localStorage.getItem("obrafacil:material-requirements")',
  'localStorage.setItem("obrafacil:material-requirements"',
  'localStorage.getItem("obrafacil:material-requirements:deleted")',
  'localStorage.setItem("obrafacil:material-requirements:deleted"',
  // Object/array literal usage (e.g. `PILOT_RESET_KEYS`, backup registry
  // entries) treating the key as active domain — but NOT a comment
  // documenting the key is intentionally absent, which is why this only
  // matches a quoted key used as a real value/array member, not prose.
  '"obrafacil:material-requirements",',
  '"obrafacil:material-requirements:deleted",',
];

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["'].*materials\/prototype\/material-requirement-store["']/,
  /from\s+["'].*materials\/prototype\/legacy-types["']/,
  /from\s+["'].*mocks\/material-requirements["']/,
];

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      collectFiles(full, out);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("MaterialRequirement legacy eradication — SUPPLY-FRONTEND-01B1 §26/§30 (LE4-LE5)", () => {
  it(
    "LE4/LE5: zero runtime file under apps/web/src reads/writes the legacy keys or imports the removed legacy store/type/mock",
    () => {
      const srcDir = join(__dirname, "../../../");
      const files = collectFiles(srcDir);
      const offenders: string[] = [];

      for (const file of files) {
        // This audit file itself necessarily mentions the forbidden
        // strings/patterns as literals to check for them — exclude it
        // explicitly, never by weakening the patterns above.
        if (file.endsWith(join("__tests__", "requirement-legacy-audit.test.ts"))) continue;

        const content = readFileSync(file, "utf-8");
        for (const pattern of FORBIDDEN_KEY_PATTERNS) {
          if (content.includes(pattern)) offenders.push(`${file}: ${pattern}`);
        }
        for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
          if (pattern.test(content)) offenders.push(`${file}: ${pattern}`);
        }
      }

      expect(offenders).toEqual([]);
    },
    15000
  );

  it("LE1: the legacy MaterialRequirement store file was actually deleted", () => {
    expect(() => readFileSync(join(__dirname, "../prototype/material-requirement-store.ts"), "utf-8")).toThrow();
  });

  it("LE2: the legacy-types.ts file was actually deleted", () => {
    expect(() => readFileSync(join(__dirname, "../prototype/legacy-types.ts"), "utf-8")).toThrow();
  });

  it("LE3: the mock file was actually deleted", () => {
    expect(() => readFileSync(join(__dirname, "../../../mocks/material-requirements.ts"), "utf-8")).toThrow();
  });

  it("LE6: backup/reset no longer treat the legacy Requirement keys as active domain", () => {
    const backupKeys = readFileSync(join(__dirname, "../../backup/pilot-backup-keys.ts"), "utf-8");
    const reset = readFileSync(join(__dirname, "../../backup/pilot-reset.ts"), "utf-8");
    // Registry entries (`"key": "shape",` / `"key",`) are forbidden — a
    // comment documenting the key is intentionally absent is not.
    expect(backupKeys.includes('"obrafacil:material-requirements": "object"')).toBe(false);
    expect(backupKeys.includes('"obrafacil:material-requirements:deleted": "array"')).toBe(false);
    expect(reset.includes('"obrafacil:material-requirements",')).toBe(false);
    expect(reset.includes('"obrafacil:material-requirements:deleted",')).toBe(false);
  });
});
