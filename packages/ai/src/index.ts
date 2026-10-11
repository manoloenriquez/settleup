// Deterministic, self-hosted helpers for the web app. No third-party AI
// provider: the natural-language and receipt intelligence features run on the
// iPhone with Apple Intelligence (apps/mobile/modules/apple-intelligence).

// Features
export { parseReceiptImage } from "./features/receipt";
export { parseConversation } from "./features/conversation";
export { suggestSplit } from "./features/smart-split";
export { computeInsights } from "./features/insights";

// Node helpers (HEIC conversion, OCR)
export { convertHeicToJpeg } from "./node/heic";
export { extractTextWithOCR } from "./node/ocr";
