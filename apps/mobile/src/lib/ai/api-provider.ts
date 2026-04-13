import type { MobileLLMProvider, MobileLLMRequest } from "./types";
import type { ApiResponse } from "@template/shared";
import { supabase } from "@/lib/supabase";

/** Create an AbortSignal that fires after `ms` — Hermes doesn't support AbortSignal.timeout() */
function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * AI provider that calls the web app's /api/ai/* REST endpoints.
 * Used when Apple Intelligence is not available.
 */
export function createApiProvider(baseUrl: string): MobileLLMProvider {
  return {
    name: "api",
    isAvailable: async () => !!baseUrl,
    generate: async (request: MobileLLMRequest): Promise<ApiResponse<{ text: string }>> => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        return { data: null, error: "Not authenticated" };
      }

      try {
        const res = await fetch(`${baseUrl}/generate`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ system: request.system, prompt: request.prompt }),
          signal: timeoutSignal(30_000),
        });
        const json = await res.json() as ApiResponse<{ text: string }>;
        return json;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "API request failed";
        return { data: null, error: msg };
      }
    },
  };
}

/**
 * Make a typed call to a specific AI API endpoint.
 * Used by feature modules to bypass the generic generate() interface when
 * the web API does prompt engineering + validation server-side.
 */
export async function callAiEndpoint<T>(
  endpoint: string,
  body: object,
): Promise<ApiResponse<T>> {
  const apiUrl = process.env["EXPO_PUBLIC_AI_API_URL"];
  if (!apiUrl) {
    return { data: null, error: "AI API not configured" };
  }

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return { data: null, error: "Not authenticated" };
  }

  try {
    const res = await fetch(`${apiUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: timeoutSignal(30_000),
    });
    const json = await res.json() as ApiResponse<T>;
    return json;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "API request failed";
    return { data: null, error: msg };
  }
}

/**
 * Make a multipart form data call to a specific AI API endpoint.
 * Uses a longer timeout (60s) since vision/image processing can be slow.
 */
export async function callAiEndpointForm<T>(
  endpoint: string,
  formData: FormData,
): Promise<ApiResponse<T>> {
  const apiUrl = process.env["EXPO_PUBLIC_AI_API_URL"];
  if (!apiUrl) {
    return { data: null, error: "AI API not configured" };
  }

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return { data: null, error: "Not authenticated" };
  }

  try {
    const res = await fetch(`${apiUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
      body: formData,
      signal: timeoutSignal(60_000),
    });
    const json = await res.json() as ApiResponse<T>;
    return json;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "API request failed";
    return { data: null, error: msg };
  }
}
