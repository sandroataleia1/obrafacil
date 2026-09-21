import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SUPPLY-FRONTEND-01C. Global audit — zero runtime import ANYWHERE under
 * `apps/web/src` of the 10 removed local Purchase/Receipt prototype
 * modules (`purchase-order-store`/`purchase-order-item-store`/
 * `goods-receipt-store`/`goods-receipt-item-store`/`use-purchase-orders`/
 * `use-purchase-order`/`use-purchase-order-item`/`purchase-order.ts`
 * (domain)/`goods-receipt.ts` (domain)/`fulfillment.ts`, all under
 * `features/purchases/prototype/`), and zero runtime occurrence of the 8
 * legacy Purchase/Receipt localStorage keys they used
 * (`obrafacil:purchase-orders`/`obrafacil:purchase-order-items`/
 * `obrafacil:goods-receipts`/`obrafacil:goods-receipt-items`, each with
 * its own `:deleted` tombstone). This file's own patterns/prose are
 * excluded from the scan (they legitimately mention the forbidden
 * strings as documentation), and mere prose mentions elsewhere are
 * distinguished from real `from "..."` import statements /
 * `localStorage.getItem/setItem("...")` calls.
 */

const FORBIDDEN_LEGACY_KEYS = [
  "obrafacil:purchase-orders",
  "obrafacil:purchase-orders:deleted",
  "obrafacil:purchase-order-items",
  "obrafacil:purchase-order-items:deleted",
  "obrafacil:goods-receipts",
  "obrafacil:goods-receipts:deleted",
  "obrafacil:goods-receipt-items",
  "obrafacil:goods-receipt-items:deleted",
];

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["'].*purchases\/prototype\/purchase-order-store["']/,
  /from\s+["'].*purchases\/prototype\/purchase-order-item-store["']/,
  /from\s+["'].*purchases\/prototype\/goods-receipt-store["']/,
  /from\s+["'].*purchases\/prototype\/goods-receipt-item-store["']/,
  /from\s+["'].*purchases\/prototype\/use-purchase-orders["']/,
  /from\s+["'].*purchases\/prototype\/use-purchase-order["']/,
  /from\s+["'].*purchases\/prototype\/use-purchase-order-item["']/,
  /from\s+["'].*purchases\/prototype\/purchase-order["']/,
  /from\s+["'].*purchases\/prototype\/goods-receipt["']/,
  /from\s+["'].*purchases\/prototype\/fulfillment["']/,
];

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
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

describe("no legacy Purchase/Receipt local store — SUPPLY-FRONTEND-01C (global audit)", () => {
  it("zero runtime file under apps/web/src imports the 10 removed prototype modules or references the 8 legacy localStorage keys via getItem/setItem", () => {
    const selfPath = join(__dirname, "no-legacy-purchase-store.test.ts");
    const srcDir = join(__dirname, "../../../");
    const files = collectFiles(srcDir).filter((file) => file !== selfPath);
    const offenders: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf-8");

      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        if (pattern.test(content)) {
          offenders.push(`${file}: ${pattern}`);
        }
      }

      for (const key of FORBIDDEN_LEGACY_KEYS) {
        if (content.includes(`localStorage.getItem("${key}")`) || content.includes(`localStorage.setItem("${key}"`)) {
          offenders.push(`${file}: localStorage access of "${key}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  }, 15000);

  it("the 10 removed prototype module files no longer exist on disk", () => {
    const prototypeDir = join(__dirname, "../prototype");
    const removed = [
      "purchase-order-store.ts",
      "purchase-order-item-store.ts",
      "goods-receipt-store.ts",
      "goods-receipt-item-store.ts",
      "use-purchase-orders.ts",
      "use-purchase-order.ts",
      "use-purchase-order-item.ts",
      "purchase-order.ts",
      "goods-receipt.ts",
      "fulfillment.ts",
    ];
    const existing = new Set(readdirSync(prototypeDir));
    const stillPresent = removed.filter((name) => existing.has(name));
    expect(stillPresent).toEqual([]);
  });

  it("the 4 removed mock seed files no longer exist on disk", () => {
    const mocksDir = join(__dirname, "../../../mocks");
    const removed = ["purchase-orders.ts", "purchase-order-items.ts", "goods-receipts.ts", "goods-receipt-items.ts"];
    const existing = new Set(readdirSync(mocksDir));
    const stillPresent = removed.filter((name) => existing.has(name));
    expect(stillPresent).toEqual([]);
  });
});
