import { Platform } from "react-native";
import { z } from "zod";
import { getNativeModule } from "../../../modules/apple-intelligence";

// ---------------------------------------------------------------------------
// Typed wrapper over the local `AppleIntelligence` Expo module.
//
// Everything behind this file runs on the device: Vision OCR and Apple's
// FoundationModels system language model. There is no cloud path and no
// fallback provider; when the model is unavailable every call returns a typed
// error and the caller keeps its manual flow. Availability is evaluated live on
// every call (Apple Intelligence can be switched off or its assets evicted).
// ---------------------------------------------------------------------------

export type AiStatus =
  | "available"
  | "deviceNotEligible"
  | "appleIntelligenceNotEnabled"
  | "modelNotReady"
  | "unavailable"
  | "unsupported";

export type AiAvailability = {
  status: AiStatus;
  contextSize: number | null;
  supportsVision: boolean;
};

export type AiErrorCode =
  | "unavailable"
  | "contextExceeded"
  | "declined"
  | "unsupportedLanguage"
  | "busy"
  | "unreadableImage"
  | "badInput"
  | "failed"
  | "bridge";

export type AiResult<T> = { data: T; error: null; code: null } | { data: null; error: string; code: AiErrorCode };

const availabilitySchema = z.object({
  status: z.enum(["available", "deviceNotEligible", "appleIntelligenceNotEnabled", "modelNotReady", "unavailable"]),
  contextSize: z.number().int().nullable().default(null),
  supportsVision: z.boolean(),
  supportsGuidedGeneration: z.boolean(),
  supportsToolCalling: z.boolean(),
});

const failureSchema = z.object({
  ok: z.literal(false),
  code: z.enum(["unavailable", "contextExceeded", "declined", "unsupportedLanguage", "busy", "unreadableImage", "badInput", "failed"]),
  message: z.string(),
});

const successSchema = z.object({ ok: z.literal(true), data: z.unknown() });
const envelopeSchema = z.union([successSchema, failureSchema]);

// Swift's JSONEncoder omits nil fields, so every optional is "missing or null".
const optionalNumber = z.number().nullable().default(null);
const optionalString = z.string().nullable().default(null);

export const receiptAnalysisSchema = z.object({
  merchant: optionalString,
  date: optionalString,
  currency: optionalString,
  subtotal: optionalNumber,
  tax: optionalNumber,
  serviceCharge: optionalNumber,
  discount: optionalNumber,
  tip: optionalNumber,
  total: optionalNumber,
  items: z.array(
    z.object({
      name: z.string(),
      quantity: optionalNumber,
      unitPrice: optionalNumber,
      totalPrice: optionalNumber,
    }),
  ),
  ocrRows: z.array(z.string()),
  strategy: z.string(),
  ocrMs: z.number(),
  modelMs: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
});
export type ReceiptAnalysis = z.infer<typeof receiptAnalysisSchema>;

export const splitShareSchema = z.object({
  name: z.string(),
  percent: optionalNumber,
  fixedAmount: optionalNumber,
  weight: optionalNumber,
  excluded: z.boolean(),
});
export type SplitShare = z.infer<typeof splitShareSchema>;

export const expenseInterpretationSchema = z.object({
  isExpense: z.boolean(),
  reply: z.string(),
  itemName: z.string(),
  amount: z.number(),
  payerName: optionalString,
  participantNames: z.array(z.string()),
  category: z.string(),
  dateMention: optionalString,
  notes: optionalString,
  splitMode: z.enum(["equal", "percent", "shares", "fixed", "exclude", "unspecified"]),
  splitDetails: z.array(splitShareSchema),
});
export type ExpenseInterpretation = z.infer<typeof expenseInterpretationSchema>;

export const splitInterpretationSchema = z.object({
  mode: z.enum(["equal", "percent", "shares", "fixed", "exclude"]),
  shares: z.array(splitShareSchema),
  explanation: z.string(),
});
export type SplitInterpretation = z.infer<typeof splitInterpretationSchema>;

const usageSchema = z.object({ inputTokens: z.number(), outputTokens: z.number(), modelMs: z.number() });
const expenseResponseSchema = z.object({ interpretation: expenseInterpretationSchema, usage: usageSchema });
const splitResponseSchema = z.object({ interpretation: splitInterpretationSchema, usage: usageSchema });
const insightsResponseSchema = z.object({ summary: z.string(), usage: usageSchema });

export type ExpenseRequest = {
  text: string;
  history: { role: "user" | "assistant"; content: string }[];
  memberNames: string[];
  userName: string | null;
  /** Local YYYY-MM-DD, so relative dates resolve on the device's calendar. */
  today: string;
};

export type SplitRequest = {
  itemName: string;
  amount: number;
  memberNames: string[];
  context: string;
};

// -- Availability --------------------------------------------------------------

export async function getAvailability(): Promise<AiAvailability> {
  const native = Platform.OS === "ios" ? getNativeModule() : null;
  if (!native) return { status: "unsupported", contextSize: null, supportsVision: false };
  try {
    const report = parseEnvelope(await native.getAvailability(), availabilitySchema);
    if (report.error !== null) return { status: "unavailable", contextSize: null, supportsVision: false };
    return { status: report.data.status, contextSize: report.data.contextSize, supportsVision: report.data.supportsVision };
  } catch {
    return { status: "unavailable", contextSize: null, supportsVision: false };
  }
}

/** Short user-facing explanation for a non-available status. */
export function describeUnavailable(status: AiStatus): string {
  switch (status) {
    case "available":
      return "";
    case "deviceNotEligible":
      return "This iPhone can't run Apple Intelligence, so on-device AI features are off. Everything else works normally.";
    case "appleIntelligenceNotEnabled":
      return "Turn on Apple Intelligence in Settings › Apple Intelligence & Siri to use on-device AI features.";
    case "modelNotReady":
      return "Apple Intelligence is still downloading its model. Try again in a few minutes.";
    case "unsupported":
      return Platform.OS === "ios"
        ? "On-device AI needs iOS 27 or later. Everything else works normally."
        : "On-device AI features are available on iPhone with Apple Intelligence. Everything else works normally.";
    case "unavailable":
      return "Apple Intelligence isn't available right now. You can still enter expenses manually.";
  }
}

/** User-facing message for a failed on-device call. */
export function describeError(code: AiErrorCode, fallback: string): string {
  switch (code) {
    case "unavailable":
      return "Apple Intelligence isn't available right now. You can still enter this manually.";
    case "contextExceeded":
      return "This is too long for the on-device model. Try a shorter message or a closer photo of the receipt.";
    case "declined":
      return "The on-device model declined this request. You can still enter it manually.";
    case "unsupportedLanguage":
      return "The on-device model doesn't support this language yet.";
    case "busy":
      return "Apple Intelligence is busy. Try again in a moment.";
    case "unreadableImage":
      return "Couldn't read any text from the photo. Retake it with the receipt filling the frame, or enter the amount manually.";
    case "badInput":
    case "failed":
    case "bridge":
      return fallback;
  }
}

// -- Calls ---------------------------------------------------------------------

export async function analyzeReceipt(uri: string): Promise<AiResult<ReceiptAnalysis>> {
  return call((native) => native.analyzeReceipt(uri), receiptAnalysisSchema);
}

export async function interpretExpense(request: ExpenseRequest): Promise<AiResult<ExpenseInterpretation>> {
  const result = await call((native) => native.interpretExpense(JSON.stringify(request)), expenseResponseSchema);
  return result.error === null ? ok(result.data.interpretation) : result;
}

export async function interpretSplit(request: SplitRequest): Promise<AiResult<SplitInterpretation>> {
  const result = await call((native) => native.interpretSplit(JSON.stringify(request)), splitResponseSchema);
  return result.error === null ? ok(result.data.interpretation) : result;
}

export async function summarizeInsights(facts: string): Promise<AiResult<string>> {
  const result = await call((native) => native.summarizeInsights(JSON.stringify({ facts })), insightsResponseSchema);
  return result.error === null ? ok(result.data.summary) : result;
}

// -- Internals -----------------------------------------------------------------

type Native = NonNullable<ReturnType<typeof getNativeModule>>;

function ok<T>(data: T): AiResult<T> {
  return { data, error: null, code: null };
}

async function call<T>(invoke: (native: Native) => Promise<string>, schema: z.ZodType<T>): Promise<AiResult<T>> {
  const native = Platform.OS === "ios" ? getNativeModule() : null;
  if (!native) return { data: null, error: describeUnavailable("unsupported"), code: "unavailable" };
  let raw: string;
  try {
    raw = await invoke(native);
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "On-device AI call failed", code: "bridge" };
  }
  return parseEnvelope(raw, schema);
}

function parseEnvelope<T>(raw: string, schema: z.ZodType<T>): AiResult<T> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { data: null, error: "On-device AI returned an unreadable result", code: "bridge" };
  }
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) return { data: null, error: "On-device AI returned an unexpected result", code: "bridge" };
  if (!envelope.data.ok) return { data: null, error: envelope.data.message, code: envelope.data.code };
  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) {
    return { data: null, error: `On-device AI result failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`, code: "bridge" };
  }
  return ok(parsed.data);
}
