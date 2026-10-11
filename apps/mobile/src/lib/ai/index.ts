// On-device intelligence layer (Apple Intelligence, iOS 27+).
//
//   apple-intelligence.ts  typed bridge to the local Expo module; availability + typed errors
//   interpretation.ts      pure mappers: model output → drafts, split cents, insight facts
//   receipt.ts             photo → OCR → guided generation → deterministic reconciliation
//   conversation.ts        natural-language expense entry
//   smart-split.ts         split description → exact cents
//   insights.ts            statistics → short narrative
//
// Nothing here talks to a server. Features degrade to manual entry when the
// model is unavailable; there is intentionally no cloud fallback.

export { getAvailability, describeUnavailable, describeError } from "./apple-intelligence";
export type { AiAvailability, AiStatus, AiErrorCode, AiResult } from "./apple-intelligence";
