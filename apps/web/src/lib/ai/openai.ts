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

      const hasImage = !!request.imageBase64 && !!request.imageMimeType;
      const model = hasImage
        ? (process.env.OPENAI_VISION_MODEL ?? "gpt-5.4-mini")
        : (process.env.OPENAI_MODEL ?? "gpt-4o-mini");
      const timeout = hasImage ? 60_000 : 30_000;

      const userContent = hasImage
        ? [
            { type: "text" as const, text: request.prompt },
            {
              type: "image_url" as const,
              image_url: {
                url: `data:${request.imageMimeType};base64,${request.imageBase64}`,
                detail: "high" as const,
              },
            },
          ]
        : request.prompt;

      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          signal: AbortSignal.timeout(timeout),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: userContent },
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
        if (e instanceof Error && e.name === "TimeoutError") {
          return { data: null, error: "OpenAI request timed out after 30s" };
        }
        const msg = e instanceof Error ? e.message : "Unknown OpenAI error";
        return { data: null, error: `OpenAI request failed: ${msg}` };
      }
    },
  };
}
