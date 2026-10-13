import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The product is Talli. Former names must not come back into anything people
// see. Word boundaries keep identifiers that name the settle-up action or the
// `settleup` database schema (SettleUpButton, createSettleUpDb) out of scope;
// docs/brand/REBRAND.md lists the legacy identifiers kept on purpose.
const LEGACY_BRAND = /\b(SettleUp|Settleup|SETTLEUP|Tabkind|TabKind|TABKIND)\b/;

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const SOURCE_DIRS = [
  "apps/web/src",
  "apps/web/public",
  "apps/web/scripts",
  "apps/mobile/app",
  "apps/mobile/src",
  "apps/mobile/modules",
  "packages/shared/src",
  "packages/ai/src",
  "apps/api/src",
];
const SOURCE_FILES = ["apps/mobile/app.json", "apps/mobile/app.config.ts"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".expo", "dist", "build", "Pods"]);
const TEXT = /\.(tsx?|jsx?|mjs|json|webmanifest|swift|podspec|html|css|md|txt)$/;

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    // sw.js is the built service worker; this file holds the pattern itself.
    else if (TEXT.test(name) && name !== "sw.js" && path !== __filename) out.push(path);
  }
  return out;
}

describe("brand", () => {
  it("no former product name in app source, assets metadata or config", () => {
    const files = [
      ...SOURCE_DIRS.flatMap((d) => walk(join(ROOT, d), [])),
      ...SOURCE_FILES.map((f) => join(ROOT, f)),
    ];
    expect(files.length).toBeGreaterThan(100);
    const hits = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) => (LEGACY_BRAND.test(line) ? [`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(hits).toEqual([]);
  });

  it("the pattern catches the brand but not the settle-up action or the schema helper", () => {
    expect(LEGACY_BRAND.test("Welcome to SettleUp")).toBe(true);
    expect(LEGACY_BRAND.test('title: "Tabkind"')).toBe(true);
    expect(LEGACY_BRAND.test("<SettleUpButton debt={d} />")).toBe(false);
    expect(LEGACY_BRAND.test("await createSettleUpDb()")).toBe(false);
    expect(LEGACY_BRAND.test("Settle Up")).toBe(false);
  });
});
