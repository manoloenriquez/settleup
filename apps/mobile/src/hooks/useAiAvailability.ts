import { useEffect, useState } from "react";
import { resolveProvider } from "@/lib/ai/provider";

export type AiAvailability = "checking" | "ready" | "unavailable";

export { AI_UNAVAILABLE_MESSAGE } from "@/lib/ai/provider";

/**
 * Resolves which AI provider this build can use (Apple Intelligence, the web
 * API backend, or none). Lets screens show a clear banner instead of letting
 * AI actions fail with a generic error when the API URL env var is missing.
 */
export function useAiAvailability(): AiAvailability {
  const [status, setStatus] = useState<AiAvailability>("checking");

  useEffect(() => {
    let cancelled = false;
    void resolveProvider().then((provider) => {
      if (!cancelled) setStatus(provider.name === "none" ? "unavailable" : "ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
