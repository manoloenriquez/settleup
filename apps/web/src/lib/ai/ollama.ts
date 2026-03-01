import type { ApiResponse } from "@template/shared/types";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types";

const BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

export function createOllamaProvider(): LLMProvider {
  return {
    name: "ollama",
    async generate(request: LLMRequest): Promise<ApiResponse<LLMResponse>> {
      try {
        const res = await fetch(`${BASE_URL}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            system: request.system,
            prompt: request.prompt,
            format: "json",
            stream: false,
            options: {
              temperature: request.temperature ?? 0.3,
            },
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return {
            data: null,
            error: `Ollama error (${res.status}): ${body.slice(0, 200)}`,
          };
        }

        const json = (await res.json()) as { response?: string };
        if (!json.response) {
          return { data: null, error: "Empty response from Ollama" };
        }

        return { data: { text: json.response }, error: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown Ollama error";
        return { data: null, error: `Ollama connection failed: ${msg}` };
      }
    },
  };
}
