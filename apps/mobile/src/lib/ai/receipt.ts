import type { ExpenseExtraction } from "@template/shared/types";
import { reconcileReceiptExtraction, reviewToParsedReceipt, type ReceiptReview } from "@template/shared";
import { analyzeReceipt, describeError, describeUnavailable, getAvailability } from "./apple-intelligence";

export type ReceiptProvider = "apple-intelligence" | null;

export type ReceiptParseResult = {
  data: ExpenseExtraction | null;
  /** Field-by-field review states from the deterministic reconciliation. */
  review: ReceiptReview | null;
  error: string | null;
  provider: ReceiptProvider;
};

const PHOTO_STAYS_LOCAL = "(Your photo never leaves this phone.)";
const MANUAL_ENTRY_HINT = "You can still enter the amount manually.";

/**
 * Structures an expense from a receipt photo, entirely on the device:
 *
 *   photo → Vision OCR rows → FoundationModels guided generation → deterministic
 *   reconciliation against the OCR rows → reviewed draft
 *
 * There is no cloud path. When Apple Intelligence is unavailable the caller
 * receives the reason and the user enters the receipt by hand.
 */
export async function structureExpenseFromImage(uri: string, _mimeType: string): Promise<ReceiptParseResult> {
  const availability = await getAvailability();
  if (availability.status !== "available") {
    return {
      data: null,
      review: null,
      error: `${describeUnavailable(availability.status)} ${MANUAL_ENTRY_HINT}`,
      provider: null,
    };
  }

  const analysis = await analyzeReceipt(uri);
  if (analysis.error !== null) {
    return {
      data: null,
      review: null,
      error: `${describeError(analysis.code, `Couldn't process the receipt on-device. ${MANUAL_ENTRY_HINT}`)} ${PHOTO_STAYS_LOCAL}`,
      provider: null,
    };
  }

  const review = reconcileReceiptExtraction(analysis.data);
  if (review.total_cents.value === null && review.items.every((item) => item.total_cents === 0)) {
    return {
      data: null,
      review,
      error: `Couldn't find any amounts on this receipt. Retake the photo with the receipt filling the frame, or enter the amount manually. ${PHOTO_STAYS_LOCAL}`,
      provider: null,
    };
  }
  return { data: reviewToParsedReceipt(review), review, error: null, provider: "apple-intelligence" };
}
