import type { ApiResponse } from "@template/shared";

export type MobileLLMRequest = {
  system: string;
  prompt: string;
  temperature?: number;
};

export type MobileLLMResponse = {
  text: string;
};

export type MobileProviderName = "apple-intelligence" | "api" | "none";

export type MobileLLMProvider = {
  name: MobileProviderName;
  isAvailable(): Promise<boolean>;
  generate(request: MobileLLMRequest): Promise<ApiResponse<MobileLLMResponse>>;
};
