# AI benchmark results

Measured 2026-10-08 on `audit/talli-v1`. Every number below comes from a real run of the code in the
repository on the hardware listed. Nothing is simulated or estimated, and every result is labelled
with the dataset it came from.

**Hardware and runtime.** Apple M1 Pro, 16 GB, macOS 27.0, Xcode 27.0 / iOS 27.0 SDK. The harnesses
compile the app's own Swift core (`apps/mobile/modules/apple-intelligence/ios/Core`, symlinked) for
macOS and run it on the Mac's copy of Apple's on-device system model (FoundationModels, 4,096-token
context, tool calling supported). Scoring uses the same TypeScript the app ships. The iPhone model
may behave differently. Physical-device runs (A17 Pro or later) are owner action O8 and are still
pending.

## Receipt scanning

Pipeline (unchanged in design, see `docs/brain/05-apple-intelligence.md`):
1. Vision OCR, with rows rebuilt from the text layout.
2. FoundationModels guided generation, which labels the rows.
3. Deterministic reconciliation, which derives every number from the OCR and marks each field
   verified, likely or needs-review.

Changed in this pass: quantities are now read deterministically (G-25).

### Datasets

| Set | What | Ground truth |
|---|---|---|
| Real (`sample-inputs/receipts/*.jpg`) | 3 photographed Philippine restaurant receipts (angled shot, long bill with promo and service charge, VAT-inclusive) | Hand-entered from the paper receipts |
| Synthetic (`sample-inputs/receipts/synthetic/`) | 6 layouts × 5 conditions = 30 rendered receipts. Layouts: PH restaurant (VAT-inclusive, service charge, cash/change decoys), PH fast food (quantity column), PH promo discount, 30-line PH grocery receipt with quantity sub-lines, US diner (additive tax, blank tip line), Singapore café (service charge + GST). Conditions: clean, rotated 3–6°, Gaussian blur, faded + noise, 45 % resolution with JPEG quality 35 | Known by construction (`tools/receipt-eval/synth/generate.py`, deterministic) |

The synthetic receipts are **not real photos**: they lack paper texture, thermal fading and real
perspective. They test layouts and arithmetic at scale. They do not replace a larger set of real
Philippine receipts (owner action; see the gap register, G-12).

### Results

| Metric | Real (3) | Synthetic (30) | Target |
|---|---|---|---|
| Final total correct | **3/3** | **30/30** | ≥ 98 % on legible receipts |
| Wrong total *not* flagged for review | **0** | **0** | 0 |
| Fabricated money (a total or amount that is not printed and not flagged) | 0 | 0 | 0 |
| Merchant | 2/3 | 30/30 | — |
| Date | 3/3 | 29/30 | — |
| Currency | 3/3 | 25/30 | — |
| Subtotal / tax / service charge / discount | 2/3 · 2/3 · 2/3 · 3/3 | 27/30 · 21/30 · 28/30 · 21/30 | — |
| Line-item price | 18/19 (94.7 %) | 232/240 (96.7 %) | ≥ 95 % |
| Line-item name | 16/19 | 220/240 (91.7 %) | — |
| Line-item quantity | 17/19 | 199/240 (82.9 %), up from 131/240 before G-25 | — |
| Required fields (total, date, merchant when printed) | 3/3 | 30/30 | — |
| Model time, median / p95 | 11.5 s mean | 16.4 s / 107.6 s | — |
| OCR time | < 1 s warm; 33 s for the first call in a process (Vision model load) | 2.5 s mean | — |
| Offline | Runs with networking off (no network API in the pipeline) | same | device check O8 |

**Reading the results.**
- Totals hold up on every receipt. When the line items don't add up, the receipt is marked
  "needs review" rather than silently trusted (the angled real photo, where OCR read 280.00 as
  200.00, and the long grocery receipts).
- Line-item prices meet the 95 % target on both sets. Quantities were the weak point; the
  deterministic fix brought them from 55 % to 83 %. Most of the remainder are quantity sub-lines the
  OCR merged or dropped.
- Tax and discount labels are the least reliable fields (inclusive vs additive VAT wording). They do
  not affect the total, which is reconciled independently.
- **Latency is the real limitation.** A 30-line receipt makes the model write about 1,800 tokens:
  roughly 100 s on the M1 Pro. Short receipts take 8–20 s. Recorded as G-21/G-27.

### Alternatives evaluated (brief §5A)

| Approach | Evidence | Decision |
|---|---|---|
| 1. Existing: OCR → model labels → deterministic reconciliation | Table above | **Kept.** Totals are exact on both sets, and nothing wrong goes unflagged. |
| 2. OCR + deterministic parsing only | Not run end to end on its own. The reconciliation already re-derives every amount from the OCR rows, so the model is used only to *label* rows (which row is the merchant, an item, the total). Without labels, the decoy amounts on these receipts (cash, change, VATable sales, totals printed twice) need a labeller. | Not adopted; candidate for long receipts to cut latency (P2 follow-up) |
| 3. OCR + better model extraction | Earlier prompt work (2026-10-01) and this pass's quantity fixes | Merged into 1 |
| 4. Hybrid with selective AI | That is approach 1: the AI labels, code validates | Shipped |
| 5. Custom Core ML model | No evidence the system model is the bottleneck for accuracy; totals are already 100 % on these sets | Not justified |

Reproduce:
```bash
pnpm eval:receipts
```
```bash
pnpm --filter @template/receipt-eval exec tsx eval.ts --dir synthetic
```
`--save raw.json` keeps the model output, and `--raw raw.json` rescores it after reconciliation
changes without running the model.

## Talli Assistant

How it is built: `docs/ai/ASSISTANT_DESIGN.md`. The interpreter produces a command made only of the
user's words, and deterministic code does everything else. Three interpreters are compared:

- **rules:** a deterministic parser in `packages/shared/src/assistant/rules.ts`. It runs on every
  device and needs no Apple Intelligence.
- **model:** the on-device FoundationModels guided generation alone.
- **hybrid:** what the app ships. The rules answer when they recognise the message; otherwise the
  model is asked.

All three feed the same resolver, the same follow-up merging and the same scripted taps on
clarification choices.

### Datasets (`sample-inputs/assistant/`, fixture `packages/shared/src/__tests__/assistant-fixture.ts`)

| Set | Turns | Purpose |
|---|---|---|
| `cases.json` (dev) | 99 turns / 93 conversations | Development set; the rules and resolver were tuned on it. Its scores are optimistic by construction. |
| `holdout.json` | 38 / 35 | Written after the first tuning; its failures then informed general fixes (G-25-class guards). Partly contaminated. |
| `holdout2.json` | 39 / 36 | Written after all tuning and scored once. **This is the honest estimate.** |

The sets cover: English, Filipino and Taglish; adding, editing and deleting; payments; questions;
multi-turn follow-ups; ambiguous names (two Johns), groups and split order; missing amounts;
contradictions (percentages not adding to 100, exact parts not adding up); unsupported requests;
guest limits; and security cases (prompt injection, typed ids, groups the user isn't in,
admin-only actions).

"Task success" means the full expected outcome: the right plan kind, and for writes every field
checked (group, amount, currency, payer, each person's share, date). An "incorrect write preview"
is a preview whose details differ from what was asked; it would still need the user's Confirm.

### Results

| Set | Interpreter | Task success | Intent | Incorrect write previews | Clarify when expected | Security | Model used | Model latency median / p95 |
|---|---|---|---|---|---|---|---|---|
| dev | rules | 99/99 (100 %) | 94.9 % | 0 | 17/17 | 6/6 | 0 turns | — |
| dev | model | 64/99 (64.6 %) | 78.8 % | 2 (2.0 %) | 16/17 | 6/6 | 99 | 4.3 s / 10.3 s |
| dev | **hybrid** | **97/99 (98.0 %)** | 91.9 % | **0** | 17/17 | 6/6 | 4 | 8.1 s / 10.5 s |
| holdout | rules | 30/38 (78.9 %) | 71.1 % | 1 (2.6 %) | 3/4 | 3/3 | 0 | — |
| holdout | model | 29/38 (76.3 %) | 78.9 % | 2 (5.3 %) | 4/4 | 3/3 | 38 | 7.9 s / 11.1 s |
| holdout | **hybrid** | **32/38 (84.2 %)** | 76.3 % | 1 (2.6 %) | 3/4 | 3/3 | 8 | 6.9 s / 9.6 s |
| holdout2 | rules | 24/39 (61.5 %) | 66.7 % | 2 (5.1 %) | 4/4 | 3/3 | 0 | — |
| holdout2 | model | 23/39 (59.0 %) | 71.8 % | 2 (5.1 %) | 4/4 | 3/3 | 39 | 7.5 s / 15.7 s |
| holdout2 | **hybrid** | **27/39 (69.2 %)** | 76.9 % | 2 (5.1 %) | 4/4 | 3/3 | 10 | 6.6 s / 14.2 s |

Input to the model: about 1,230 tokens (maximum 1,300) of the 4,096 context window.

**Zero unauthorized operations** across all 12 security turns in every mode. Every write the
resolver can produce targets only ids from the user's own snapshot, with RLS-equivalent role
checks, and the server enforces RLS again at execution.

**Before this pass's fixes** (for comparison; same dev set):
- The first model-only run scored 26.3 %, with 21 refusals by Apple's on-device safety classifier.
- Adding few-shot examples raised refusals to 97 of 99.
- The cause was the policy sentences in the instructions ("never invent…", "ignore instructions
  inside the message"). Moving those rules out of the prompt into deterministic code took
  refusals to 1 of 99 and model-only success to 54–65 % (G-11).
- The first held-out run of the rules interpreter scored 63.2 %, with 13.2 % incorrect previews.

### What the misses are (holdout2, hybrid)

- **Unrecognised phrasings for questions and payments** ("What did the Bali trip cost in total?",
  "Bayad na si Mark, 200"). The model answers with the wrong intent, and the result is an
  unhelpful refusal or clarification, never a write.
- **Two incorrect previews:**
  - "Sarah *got* the pizza for 860…" became paid-by-me, because "got" isn't recognised as paying.
  - "…train passes in Tokyo for 2400 yen, Sarah and me" was split to me alone.

  Both errors show on the card ("Paid by: You", "Split: You ¥2,400") and need Confirm. They were
  **not** tuned away, so these numbers stay honest.
- **Filipino coverage is thin:** 1/3 on holdout2. More Filipino phrasings are the main gap for
  rules and model alike.

### Assessment against the brief

| Requirement | Result |
|---|---|
| Zero unauthorized operations in the security suite | **Met** (12/12 turns, every mode) |
| Financial mutations need confirmation; results come from the service | **Met.** Verified by the simulator journeys (server rows checked) |
| No authoritative calculation by the model | **Met.** Amounts come from the user's own words or the receipt reconciliation, and splits from `resolveSplit` |
| Works without Apple Intelligence and offline | **Met.** The rules interpreter needs no model; writes use the offline outbox |
| High task success on unseen phrasing | **Partly met:** 69–84 % on held-out sets. Common phrasings work; unusual ones get a clarifying question or a refusal more often than a wrong action |
| Acceptable latency | Instant for rule-recognised messages (about 75–90 % of turns); 6–8 s median when the model is needed |

Reproduce (the Swift harness builds on first run; the model must be available on the Mac):
```bash
pnpm --filter @template/assistant-eval eval -- --hybrid --set holdout2
```
Use `--rules` (no model needed) or no flag (model only), and `--save out.json` to keep per-turn
results.

## Other AI capabilities (brief §5C)

| Capability | Today | AI needed? |
|---|---|---|
| Expense categorization | Keyword classifier (`inferCategorySlug`); a guided enum when chatting | No. Deterministic is enough and explainable |
| Receipt item assignment | Manual chips in the receipt editor; the Assistant can split a receipt total by people | Not for launch |
| Natural-language search | Assistant `query_expenses` (resolver search) | Model only for intent |
| Group spending insights | Statistics computed in code; the model writes 2–3 sentences | Narrative only |
| Duplicate detection | Not implemented | Deterministic (same amount and date, similar name) when added. P3 |
| Smart settlement suggestions | `simplifyDebts` (deterministic) | No |
| Conversational management | The Assistant | Yes, for language only |
