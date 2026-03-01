import type { ApiResponse } from "@template/shared/types";

export type LLMRequest = {
  system: string;
  prompt: string;
  temperature?: number;
};

export type LLMResponse = {
  text: string;
};

export type LLMProvider = {
  name: string;
  generate(request: LLMRequest): Promise<ApiResponse<LLMResponse>>;
};
