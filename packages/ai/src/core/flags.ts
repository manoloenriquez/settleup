export function isLLMEnabled(): boolean {
  return process.env.LLM_ENABLED === "true";
}
