// Core
export { generateJSON, generateJSONFromImage } from "./core/generate";
export { isLLMEnabled } from "./core/flags";
export { createProvider, resetProviderCache } from "./core/provider";
export { createOpenAIProvider } from "./core/openai";
export type { LLMRequest, LLMResponse, LLMProvider } from "./core/types";

// Features
export { parseReceiptImage } from "./features/receipt";
export { parseConversation } from "./features/conversation";
export { suggestSplit } from "./features/smart-split";
export { computeInsights, generateInsightsSummary } from "./features/insights";

// Node helpers (HEIC conversion, OCR)
export { convertHeicToJpeg } from "./node/heic";
export { extractTextWithOCR } from "./node/ocr";
