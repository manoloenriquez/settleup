/**
 * Receipt extraction evaluation.
 *
 * 1. Runs the Swift CLI (the iOS module's core compiled for macOS) over every
 *    receipt that has an expected-values file in sample-inputs/receipts/expected.
 * 2. Reconciles each raw extraction with the same shared TypeScript code the app
 *    uses (`reconcileReceiptExtraction`).
 * 3. Scores the reconciled result against the expected values and prints a table.
 *
 *   pnpm eval:receipts                 build + run + score
 *   pnpm --filter @template/receipt-eval eval:raw <file.json>   score a saved raw run
 *   ... eval.ts --save raw.json        keep the raw Swift output for later comparison
 *
 * Apple's system model changes with OS updates, so treat a drop in any column
 * as a regression to investigate (prompt, OCR row reconstruction, or model).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  reconcileReceiptExtraction,
  type ReceiptExtractionInput,
  type ReceiptReview,
} from "@template/shared";

type ExpectedItem = { name: string; quantity: number; unitPrice: number; totalPrice: number };
type Expected = {
  image: string;
  merchant: string | null;
  date: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  taxInclusive?: boolean;
  serviceCharge: number | null;
  discount: number | null;
  tip: number | null;
  total: number | null;
  items: ExpectedItem[];
};

type RawEntry = {
  image: string;
  analysis: (Omit<ReceiptExtractionInput, "ocrRows"> & {
    ocrRows: string[];
    strategy: string;
    ocrMs: number;
    modelMs: number;
    inputTokens: number;
    outputTokens: number;
  }) | null;
  error: string | null;
  totalMs: number;
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const args = process.argv.slice(2);
/** --dir synthetic scores sample-inputs/receipts/synthetic (rendered, ground truth by construction). */
const dirArg = args.indexOf("--dir");
const receiptsDir = join(repoRoot, "sample-inputs", "receipts", dirArg >= 0 ? args[dirArg + 1]! : "");
const expectedDir = join(receiptsDir, "expected");

const rawArg = args.indexOf("--raw");
const saveArg = args.indexOf("--save");

const expectedFiles = readdirSync(expectedDir).filter((f) => f.endsWith(".json")).sort();
const expected = expectedFiles.map((f) => JSON.parse(readFileSync(join(expectedDir, f), "utf8")) as Expected);

let raw: RawEntry[];
if (rawArg >= 0) {
  const file = args[rawArg + 1];
  if (!file || !existsSync(file)) {
    console.error("--raw needs a path to a saved raw JSON file");
    process.exit(2);
  }
  raw = JSON.parse(readFileSync(file, "utf8")) as RawEntry[];
} else {
  const binary = join(here, ".build", "release", "receipt-eval");
  if (!existsSync(binary)) {
    console.error(`Swift binary missing at ${binary}. Run: pnpm --filter @template/receipt-eval build:swift`);
    process.exit(2);
  }
  const run = spawnSync(binary, [receiptsDir, ...expected.map((e) => e.image)], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.status !== 0) {
    console.error(`receipt-eval exited with ${run.status}`);
    process.exit(1);
  }
  raw = JSON.parse(run.stdout) as RawEntry[];
  if (saveArg >= 0 && args[saveArg + 1]) writeFileSync(args[saveArg + 1]!, JSON.stringify(raw, null, 2));
}

// -- Scoring ------------------------------------------------------------------

const cents = (pesos: number | null): number | null => (pesos === null ? null : Math.round(pesos * 100));
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function nameMatches(got: string, want: string): boolean {
  const g = norm(got), w = norm(want);
  return g === w || g.includes(w) || w.includes(g) || (g.length >= 4 && w.startsWith(g.slice(0, 4)));
}

type Row = {
  image: string;
  ok: boolean;
  error: string | null;
  merchant: boolean;
  date: boolean;
  currency: boolean;
  total: boolean;
  subtotal: boolean;
  tax: boolean;
  serviceCharge: boolean;
  discount: boolean;
  itemCount: boolean;
  itemsExpected: number;
  itemTotals: number;
  itemNames: number;
  itemQuantities: number;
  requiredComplete: boolean;
  overall: ReceiptReview["overall"] | "-";
  needsReview: number;
  ocrMs: number;
  modelMs: number;
  tokens: string;
};

const rows: Row[] = expected.map((exp) => {
  const entry = raw.find((r) => r.image === exp.image);
  const base: Row = {
    image: exp.image, ok: false, error: entry?.error ?? "no result", merchant: false, date: false, currency: false, total: false,
    subtotal: false, tax: false, serviceCharge: false, discount: false, itemCount: false, itemsExpected: exp.items.length,
    itemTotals: 0, itemNames: 0, itemQuantities: 0, requiredComplete: false, overall: "-", needsReview: 0, ocrMs: 0, modelMs: 0, tokens: "-",
  };
  if (!entry?.analysis) return base;
  const review = reconcileReceiptExtraction(entry.analysis);
  const merchantOk = review.merchant.value === null
    ? exp.merchant === null
    : exp.merchant !== null && nameMatches(review.merchant.value, exp.merchant);
  let itemTotals = 0, itemNames = 0, itemQuantities = 0;
  const remaining = [...review.items];
  for (const want of exp.items) {
    const idx = remaining.findIndex((i) => i.total_cents === cents(want.totalPrice));
    if (idx < 0) continue;
    itemTotals += 1;
    const got = remaining[idx]!;
    if (nameMatches(got.name, want.name)) itemNames += 1;
    if (got.quantity === want.quantity) itemQuantities += 1;
    remaining.splice(idx, 1);
  }
  const fields = [review.merchant, review.date, review.total_cents, review.subtotal_cents, review.tax_cents, review.service_charge_cents, review.discount_cents];
  return {
    ...base,
    ok: true,
    error: null,
    merchant: merchantOk,
    date: review.date.value === exp.date,
    currency: review.currency.value === (exp.currency ?? "PHP"),
    total: review.total_cents.value === cents(exp.total),
    subtotal: review.subtotal_cents.value === cents(exp.subtotal),
    tax: review.tax_cents.value === cents(exp.tax),
    serviceCharge: review.service_charge_cents.value === cents(exp.serviceCharge),
    discount: review.discount_cents.value === cents(exp.discount),
    itemCount: review.items.length === exp.items.length,
    itemTotals,
    itemNames,
    itemQuantities,
    requiredComplete: review.total_cents.value !== null && review.date.value !== null && (exp.merchant === null || review.merchant.value !== null),
    overall: review.overall,
    needsReview: fields.filter((f) => f.state === "needs_review").length + review.items.filter((i) => i.state === "needs_review").length,
    ocrMs: entry.analysis.ocrMs,
    modelMs: entry.analysis.modelMs,
    tokens: `${entry.analysis.inputTokens}/${entry.analysis.outputTokens}`,
  };
});

const tick = (b: boolean): string => (b ? "✓" : "✗");
console.log("\n| receipt | merchant | date | total | subtotal | tax | svc | disc | items (price/name/qty of n) | required | overall | needs review | ocr ms | model ms | tokens in/out |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  if (!r.ok) {
    console.log(`| ${r.image} | FAILED: ${r.error} |`);
    continue;
  }
  console.log(`| ${r.image} | ${tick(r.merchant)} | ${tick(r.date)} | ${tick(r.total)} | ${tick(r.subtotal)} | ${tick(r.tax)} | ${tick(r.serviceCharge)} | ${tick(r.discount)} | ${r.itemTotals}/${r.itemNames}/${r.itemQuantities} of ${r.itemsExpected} | ${tick(r.requiredComplete)} | ${r.overall} | ${r.needsReview} | ${r.ocrMs} | ${r.modelMs} | ${r.tokens} |`);
}

const ok = rows.filter((r) => r.ok);
const pct = (f: (r: Row) => boolean): string => `${ok.filter(f).length}/${rows.length}`;
const sum = (f: (r: Row) => number): number => ok.reduce((s, r) => s + f(r), 0);
const itemsExpected = rows.reduce((s, r) => s + r.itemsExpected, 0);
console.log(`\nsuccess ${ok.length}/${rows.length} · total ${pct((r) => r.total)} · merchant ${pct((r) => r.merchant)} · date ${pct((r) => r.date)} · subtotal ${pct((r) => r.subtotal)} · tax ${pct((r) => r.tax)} · service charge ${pct((r) => r.serviceCharge)} · discount ${pct((r) => r.discount)}`);
console.log(`items: price ${sum((r) => r.itemTotals)}/${itemsExpected} · name ${sum((r) => r.itemNames)}/${itemsExpected} · quantity ${sum((r) => r.itemQuantities)}/${itemsExpected} · required fields complete ${pct((r) => r.requiredComplete)}`);
// Safety: a wrong total the review screen does NOT flag is the dangerous case
// (the person could save it without noticing). Target: zero.
const unflagged = ok.filter((r) => !r.total && r.overall !== "needs_review");
console.log(`currency ${pct((r) => r.currency)} · wrong total flagged for review ${ok.filter((r) => !r.total && r.overall === "needs_review").length} · wrong total NOT flagged ${unflagged.length}${unflagged.length ? ` (${unflagged.map((r) => r.image).join(", ")})` : ""}`);
if (ok.length > 0) {
  console.log(`latency: model avg ${Math.round(sum((r) => r.modelMs) / ok.length)} ms · ocr avg ${Math.round(sum((r) => r.ocrMs) / ok.length)} ms (first OCR call in a process includes model load)`);
}

const failed = rows.filter((r) => !r.ok || !r.total);
process.exitCode = failed.length > 0 ? 1 : 0;
