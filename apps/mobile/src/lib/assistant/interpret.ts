import { interpretWithRules, type AssistantCommand } from "@template/shared";
import { getAvailability, interpretAssistant, type AssistantRequest } from "@/lib/ai/apple-intelligence";

// ---------------------------------------------------------------------------
// Which interpreter reads a message. The deterministic rules interpreter is
// exact on the phrasings it knows and costs nothing; the on-device model reads
// everything else. Both produce the same command, and the same resolver checks
// it, so the model can never do more than the rules could. The order is the
// one measured best in docs/ai/AI_BENCHMARK_RESULTS.md (tools/assistant-eval
// --hybrid uses the same rule).
// ---------------------------------------------------------------------------

export type Interpretation = {
  command: AssistantCommand;
  source: "rules" | "model";
  modelMs: number | null;
  /** Set when Apple Intelligence was wanted but unavailable or failed. */
  notice: string | null;
};

export async function interpretMessage(request: AssistantRequest): Promise<Interpretation> {
  const rules = interpretWithRules(request.text);
  if (rules.action !== "unsupported") return { command: rules, source: "rules", modelMs: null, notice: null };
  const availability = await getAvailability();
  if (availability.status !== "available") {
    return { command: rules, source: "rules", modelMs: null, notice: "unavailable" };
  }
  const result = await interpretAssistant(request);
  if (result.error !== null) return { command: rules, source: "rules", modelMs: null, notice: result.error };
  return { command: result.data.command, source: "model", modelMs: result.data.modelMs, notice: null };
}
