import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SUPPLY-FRONTEND-01A §77, MF18/SF18. Source audit: no RUNTIME file under
 * `src/features/materials` or `src/features/suppliers` reads/writes the
 * removed master localStorage keys. Child prototype localStorage
 * (MaterialRequirement/MaterialConsumption/PurchaseOrder/StockAdjustment
 * stores) is deliberately out of scope — this only proves the MASTER
 * itself stayed API-only.
 */
const FORBIDDEN_PATTERNS = [
  'localStorage.getItem("obrafacil:materials")',
  'localStorage.setItem("obrafacil:materials"',
  'localStorage.getItem("obrafacil:suppliers")',
  'localStorage.setItem("obrafacil:suppliers"',
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

describe("no Material/Supplier master localStorage — SUPPLY-FRONTEND-01A §77", () => {
  it("MF18/SF18: zero runtime file reads/writes the removed master keys", () => {
    const materialsDir = join(__dirname, "..");
    const suppliersDir = join(__dirname, "../../suppliers");

    const files = [...collectFiles(materialsDir), ...collectFiles(suppliersDir)];
    const offenders: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (content.includes(pattern)) {
          offenders.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * SUPPLY-FRONTEND-01A1 §24. Global audit — zero runtime import of the
 * removed master prototype modules (`materials/prototype/material` /
 * `suppliers/prototype/supplier-store`) and zero use of the removed
 * master localStorage keys ANYWHERE under `apps/web/src`, not just inside
 * `features/materials`/`features/suppliers`. A dependent module (e.g. a
 * Requirement/PurchaseOrder selector) importing the old prototype master
 * directly instead of `useAllMaterials`/`useAllSuppliers` would be
 * exactly the kind of stale-data regression this proves is absent.
 */
describe("no Material/Supplier master localStorage — SUPPLY-FRONTEND-01A1 §24 (global audit)", () => {
  it("zero runtime file under apps/web/src imports the removed master prototype modules or reads/writes the removed keys", () => {
    const srcDir = join(__dirname, "../../../");
    const files = collectFiles(srcDir);
    const offenders: string[] = [];

    const forbiddenImportPatterns = [
      /from\s+["'].*materials\/prototype\/material["']/,
      /from\s+["'].*suppliers\/prototype\/supplier-store["']/,
    ];

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (content.includes(pattern)) {
          offenders.push(`${file}: ${pattern}`);
        }
      }
      for (const pattern of forbiddenImportPatterns) {
        if (pattern.test(content)) {
          offenders.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  }, 15000);
});
