import type { ApiResponse } from "@template/shared/types";

export type LLMRequest = {
  system: string;
  prompt: string;
  temperature?: number;
  /** Base64-encoded image data for vision-capable models */
  imageBase64?: string;
  /** MIME type of the image (e.g., "image/jpeg") */
  imageMimeType?: string;
};

export type LLMResponse = {
  text: string;
};

export type LLMProvider = {
  name: string;
  generate(request: LLMRequest): Promise<ApiResponse<LLMResponse>>;
};
