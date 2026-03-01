import type { ApiResponse } from "@template/shared/types";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types";

export function createOpenAIProvider(): LLMProvider {
  const apiKey = process.env.OPENAI_API_KEY;

  return {
    name: "openai",
    async generate(request: LLMRequest): Promise<ApiResponse<LLMResponse>> {
      if (!apiKey) {
        return { data: null, error: "OPENAI_API_KEY is not configured" };
      }

      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.prompt },
            ],
            temperature: request.temperature ?? 0.3,
            response_format: { type: "json_object" },
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return {
            data: null,
            error: `OpenAI error (${res.status}): ${body.slice(0, 200)}`,
          };
        }

        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const text = json.choices?.[0]?.message?.content;
        if (!text) {
          return { data: null, error: "Empty response from OpenAI" };
        }

        return { data: { text }, error: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown OpenAI error";
        return { data: null, error: `OpenAI request failed: ${msg}` };
      }
    },
  };
}
