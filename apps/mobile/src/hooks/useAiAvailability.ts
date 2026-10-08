import { useEffect, useState } from "react";
import { describeUnavailable, getAvailability, type AiStatus } from "@/lib/ai/apple-intelligence";

export type AiAvailability = {
  state: "checking" | "ready" | "unavailable";
  /** Live Apple Intelligence status; null while checking. */
  status: AiStatus | null;
  /** User-facing explanation when unavailable, otherwise null. */
  reason: string | null;
};

/** Generic message for screens that need a one-liner before the reason is known. */
export const AI_UNAVAILABLE_MESSAGE = "Apple Intelligence isn't available on this device. You can still add expenses manually.";

/**
 * Live Apple Intelligence availability for a screen. Re-evaluated on every
 * mount and never persisted: the model can be toggled off in Settings or its
 * assets evicted, and an ineligible device stays ineligible.
 */
export function useAiAvailability(): AiAvailability {
  const [availability, setAvailability] = useState<AiAvailability>({ state: "checking", status: null, reason: null });

  useEffect(() => {
    let cancelled = false;
    void getAvailability().then((report) => {
      if (cancelled) return;
      setAvailability(
        report.status === "available"
          ? { state: "ready", status: report.status, reason: null }
          : { state: "unavailable", status: report.status, reason: describeUnavailable(report.status) },
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return availability;
}
