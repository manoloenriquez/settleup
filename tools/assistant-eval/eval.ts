/**
 * Talli Assistant evaluation.
 *
 *   pnpm --filter @template/assistant-eval eval              model (Mac on-device system model) + resolver
 *   pnpm --filter @template/assistant-eval eval -- --rules   rules interpreter + resolver (no model)
 *   ... --hybrid      the app's production mode (see interpretHybrid)
 *   ... --only add-01,mt-03   run selected cases     ... --save out.json   keep per-turn results
 *
 * Each case is a conversation over the fixture in
 * packages/shared/src/__tests__/assistant-fixture.ts. The interpreter turns
 * each message into a command, follow-ups are merged exactly as the app does,
 * the shared resolver builds the plan, and "choose" simulates tapping a
 * clarification choice. Nothing here is simulated model output: --rules and
 * the model mode are scored separately and labelled as such.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  EMPTY_FOCUS,
  assistantCommandSchema,
  buildModelContext,
  interpretWithRules,
  isLoadRequest,
  mergeFollowUp,
  nextFocus,
  pendingAfter,
  resolveCommand,
  type AssistantCommand,
  type AssistantFocus,
  type AssistantHints,
  type AssistantPlan,
  type LoadRequest,
  type PendingTurn,
} from "@template/shared";
import * as fixture from "../../packages/shared/src/__tests__/assistant-fixture";

type Expect = {
  kind?: AssistantPlan["kind"];
  notKind?: AssistantPlan["kind"];
  action?: Record<string, unknown>;
  shares?: [string, number][];
  textIncludes?: string;
  choose?: string;
  then?: Expect;
};
type Turn = { text: string; intent: string; expect: Expect };
type Case = { id: string; category: string; lang: string; guest?: boolean; turns: Turn[] };

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const args = process.argv.slice(2);
const mode: "model" | "rules" | "hybrid" = args.includes("--rules") ? "rules" : args.includes("--hybrid") ? "hybrid" : "model";
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1]!.split(",")) : null;
const savePath = args.includes("--save") ? args[args.indexOf("--save") + 1] : null;
/** "cases" (development set) or "holdout" (never tuned against). */
const set = args.includes("--set") ? args[args.indexOf("--set") + 1]! : "cases";

const ids = fixture as unknown as Record<string, string>;
function sub(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith("$")) return ids[value.slice(1)] ?? value;
  if (Array.isArray(value)) return value.map(sub);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sub(v)]));
  return value;
}

// ---------------------------------------------------------------------------
// Model bridge (line protocol with the Swift harness)
// ---------------------------------------------------------------------------

let child: ChildProcessWithoutNullStreams | null = null;
let lines: AsyncIterableIterator<string> | null = null;

function startModel(): void {
  child = spawn(join(here, ".build", "release", "assistant-eval"), [], { stdio: ["pipe", "pipe", "pipe"] });
  child.stderr.on("data", (d: Buffer) => process.stderr.write(d));
  lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
}

type ModelResult = { command: AssistantCommand | null; error: string | null; ms: number; tokensIn: number; tokensOut: number };

async function askModel(id: string, text: string, history: { role: string; content: string }[], context: string, guest: boolean): Promise<ModelResult> {
  child!.stdin.write(
    JSON.stringify({ id, request: { text, history, context, userName: guest ? null : "Paolo", today: "2026-10-08" } }) + "\n",
  );
  const next = await lines!.next();
  const raw = JSON.parse(next.value as string) as { command?: unknown; error?: string; ms: number; usage?: { inputTokens: number; outputTokens: number } };
  const parsed = raw.command ? assistantCommandSchema.safeParse(raw.command) : null;
  return {
    command: parsed?.success ? parsed.data : null,
    error: raw.error ?? (parsed && !parsed.success ? "schema" : null),
    ms: raw.ms,
    tokensIn: raw.usage?.inputTokens ?? 0,
    tokensOut: raw.usage?.outputTokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function matches(plan: AssistantPlan | LoadRequest, expect: Expect, problems: string[]): boolean {
  if (expect.notKind) {
    if (plan.kind === expect.notKind) problems.push(`got ${plan.kind}, must not be ${expect.notKind}`);
    return plan.kind !== expect.notKind;
  }
  if (expect.kind && plan.kind !== expect.kind) {
    problems.push(`kind ${plan.kind} ≠ ${expect.kind}${"text" in plan ? ` ("${plan.text.slice(0, 90)}")` : ""}`);
    return false;
  }
  if (expect.textIncludes && !("text" in plan && plan.text.includes(expect.textIncludes))) {
    problems.push(`text lacks "${expect.textIncludes}": "${"text" in plan ? plan.text.slice(0, 120) : ""}"`);
    return false;
  }
  if (plan.kind === "propose" && expect.action) {
    const action = plan.proposal.action as Record<string, unknown>;
    for (const [key, want] of Object.entries(sub(expect.action) as Record<string, unknown>)) {
      if (JSON.stringify(action[key]) !== JSON.stringify(want)) {
        problems.push(`${key}: ${JSON.stringify(action[key])} ≠ ${JSON.stringify(want)}`);
        return false;
      }
    }
  }
  if (plan.kind === "propose" && expect.shares) {
    const action = plan.proposal.action as { shares?: { memberId: string; shareCents: number }[] };
    const want = (sub(expect.shares) as [string, number][]).map(([memberId, shareCents]) => ({ memberId, shareCents }));
    const got = [...(action.shares ?? [])].sort((a, b) => a.memberId.localeCompare(b.memberId));
    const sortedWant = [...want].sort((a, b) => a.memberId.localeCompare(b.memberId));
    if (JSON.stringify(got) !== JSON.stringify(sortedWant)) {
      problems.push(`shares ${JSON.stringify(got.map((s) => s.shareCents))} ≠ ${JSON.stringify(sortedWant.map((s) => s.shareCents))}`);
      return false;
    }
  }
  return true;
}

type TurnResult = {
  caseId: string;
  turn: number;
  category: string;
  lang: string;
  text: string;
  intentExpected: string;
  intentGot: string | null;
  pass: boolean;
  /** A write preview that does not match what the user asked for. */
  wrongProposal: boolean;
  expectedClarify: boolean;
  gotClarify: boolean;
  modelMs: number | null;
  tokensIn: number;
  problems: string[];
  command: AssistantCommand | null;
};

async function main(): Promise<void> {
  const data = JSON.parse(readFileSync(join(repoRoot, "sample-inputs", "assistant", `${set}.json`), "utf8")) as { cases: Case[] };
  const cases = data.cases.filter((c) => !only || only.has(c.id));
  if (mode !== "rules") startModel();
  const results: TurnResult[] = [];
  let seq = 0;
  for (const kase of cases) {
    const snapshot = fixture.fixtureSnapshot(kase.guest ? { isGuest: true, groups: [], myName: null } : {});
    let focus: AssistantFocus = EMPTY_FOCUS;
    let pending: PendingTurn | null = null;
    const history: { role: string; content: string }[] = [];
    for (const [index, turn] of kase.turns.entries()) {
      const context = buildModelContext(snapshot, focus);
      let command: AssistantCommand | null = null;
      let modelMs: number | null = null;
      let tokensIn = 0;
      const problems: string[] = [];
      if (mode === "rules") {
        command = interpretWithRules(turn.text);
      } else {
        const r = await askModel(`${kase.id}#${index}#${++seq}`, turn.text, history, context, Boolean(kase.guest));
        modelMs = r.ms;
        tokensIn = r.tokensIn;
        if (r.error) problems.push(`model error: ${r.error}`);
        command = r.command;
        if (mode === "hybrid" && command) command = hybrid(turn.text, command);
      }
      let pass = false;
      let wrongProposal = false;
      let gotClarify = false;
      let finalPlan: AssistantPlan | LoadRequest | null = null;
      let merged = command;
      if (command) {
        const m = mergeFollowUp(pending, command, turn.text);
        merged = m.command;
        let plan = resolveCommand({ command: m.command, text: m.text, snapshot, focus, newId: () => `p${++seq}` });
        gotClarify = plan.kind === "clarify";
        let expect: Expect | undefined = turn.expect;
        pass = matches(plan, expect, problems);
        // Follow the scripted choice taps; earlier taps keep applying, as in the app.
        let hints: AssistantHints = {};
        while (pass && expect?.choose && plan.kind === "clarify") {
          const choice: { hints: AssistantHints } | undefined = plan.choices.find((c) => c.label === expect!.choose);
          if (!choice) {
            problems.push(`no choice "${expect.choose}" in [${plan.choices.map((c) => c.label).join(", ")}]`);
            pass = false;
            break;
          }
          hints = { ...hints, ...choice.hints, memberIds: { ...hints.memberIds, ...choice.hints.memberIds } };
          plan = resolveCommand({ command: m.command, text: m.text, snapshot, focus, hints, newId: () => `p${++seq}` });
          expect = expect.then;
          if (expect) pass = matches(plan, expect, problems);
        }
        finalPlan = plan;
        const finalExpect = lastExpect(turn.expect);
        if (plan.kind === "propose" && !pass) wrongProposal = finalExpect.kind === "propose" || finalExpect.notKind === "propose" || finalExpect.kind !== undefined;
        focus = isLoadRequest(plan) ? focus : nextFocus(focus, plan);
        pending = pendingAfter(plan, m.command, m.text);
        history.push({ role: "user", content: turn.text });
        if (!isLoadRequest(plan)) history.push({ role: "assistant", content: plan.text });
      } else {
        problems.push("no command");
        history.push({ role: "user", content: turn.text });
      }
      results.push({
        caseId: kase.id,
        turn: index,
        category: kase.category,
        lang: kase.lang,
        text: turn.text,
        intentExpected: turn.intent,
        intentGot: merged?.action ?? null,
        pass,
        wrongProposal,
        expectedClarify: turn.expect.kind === "clarify",
        gotClarify,
        modelMs,
        tokensIn,
        problems,
        command: merged,
      });
      const mark = pass ? "✓" : wrongProposal ? "✗!" : "✗";
      console.error(`${mark} ${kase.id}#${index} ${turn.text.slice(0, 60)}${problems.length ? `  — ${problems.join("; ")}` : ""}${finalPlan && !pass && "text" in finalPlan ? "" : ""}`);
    }
  }
  child?.stdin.end();
  report(results);
  if (savePath) writeFileSync(savePath, JSON.stringify({ mode, results }, null, 2));
}

function lastExpect(expect: Expect): Expect {
  let e = expect;
  while (e.then) e = e.then;
  return e;
}

/**
 * Production interpreter on capable devices: the rules interpreter is
 * deterministic and precise on the phrasings it knows, so its command wins
 * when it recognised the message; otherwise the model's command is used.
 * (Kept identical to apps/mobile/src/lib/assistant/interpret.ts.)
 */
function hybrid(text: string, modelCommand: AssistantCommand): AssistantCommand {
  const rules = interpretWithRules(text);
  return rules.action === "unsupported" ? modelCommand : rules;
}

function pct(n: number, d: number): string {
  return d === 0 ? "–" : `${((100 * n) / d).toFixed(1)}%`;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

function report(results: TurnResult[]): void {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const intents = results.filter((r) => r.intentGot === r.intentExpected).length;
  const wrong = results.filter((r) => r.wrongProposal).length;
  const clar = results.filter((r) => r.expectedClarify);
  const security = results.filter((r) => r.category === "security");
  const ms = results.map((r) => r.modelMs).filter((v): v is number => v !== null);
  console.log(`\n## Assistant evaluation (${set}) — ${mode === "rules" ? "rules interpreter (no model)" : mode === "hybrid" ? "hybrid (rules first, then on-device model)" : "on-device model only"}\n`);
  console.log(`| metric | value |\n|---|---|`);
  console.log(`| turns | ${total} (${new Set(results.map((r) => r.caseId)).size} conversations) |`);
  console.log(`| task success | ${passed}/${total} (${pct(passed, total)}) |`);
  console.log(`| intent accuracy | ${intents}/${total} (${pct(intents, total)}) |`);
  console.log(`| clarification when expected | ${clar.filter((r) => r.gotClarify).length}/${clar.length} |`);
  console.log(`| incorrect write previews | ${wrong}/${total} (${pct(wrong, total)}) |`);
  console.log(`| security cases passed | ${security.filter((r) => r.pass).length}/${security.length} |`);
  if (ms.length) {
    console.log(`| model latency median / p95 | ${percentile(ms, 50)} / ${percentile(ms, 95)} ms |`);
    const tokens = results.map((r) => r.tokensIn).filter((t) => t > 0);
    console.log(`| input tokens median / max | ${percentile(tokens, 50)} / ${Math.max(...tokens)} |`);
  }
  const byCategory = new Map<string, TurnResult[]>();
  for (const r of results) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
  console.log(`\n| category | success | intent | wrong previews |\n|---|---|---|---|`);
  for (const [category, rs] of [...byCategory.entries()].sort()) {
    console.log(`| ${category} | ${rs.filter((r) => r.pass).length}/${rs.length} | ${rs.filter((r) => r.intentGot === r.intentExpected).length}/${rs.length} | ${rs.filter((r) => r.wrongProposal).length} |`);
  }
  const byLang = new Map<string, TurnResult[]>();
  for (const r of results) byLang.set(r.lang, [...(byLang.get(r.lang) ?? []), r]);
  console.log(`\n| language | success |\n|---|---|`);
  for (const [lang, rs] of byLang) console.log(`| ${lang} | ${rs.filter((r) => r.pass).length}/${rs.length} |`);
  const failures = results.filter((r) => !r.pass);
  if (failures.length) {
    console.log(`\n### Failures\n`);
    for (const f of failures) console.log(`- ${f.wrongProposal ? "**wrong preview** " : ""}\`${f.caseId}#${f.turn}\` "${f.text}" — intent ${f.intentGot ?? "none"} (want ${f.intentExpected}); ${f.problems.join("; ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
