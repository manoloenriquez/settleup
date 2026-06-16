import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { isLLMEnabled } from "../core/flags";
import { generateJSON } from "../core/generate";

describe("isLLMEnabled", () => {
  const original = process.env.LLM_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.LLM_ENABLED;
    else process.env.LLM_ENABLED = original;
  });

  it("returns false when LLM_ENABLED is not set", () => {
    delete process.env.LLM_ENABLED;
    expect(isLLMEnabled()).toBe(false);
  });

  it("returns true when LLM_ENABLED is 'true'", () => {
    process.env.LLM_ENABLED = "true";
    expect(isLLMEnabled()).toBe(true);
  });

  it("returns false when LLM_ENABLED is 'false'", () => {
    process.env.LLM_ENABLED = "false";
    expect(isLLMEnabled()).toBe(false);
  });
});

describe("generateJSON", () => {
  const schema = z.object({ value: z.string() });
  const opts = { system: "sys", prompt: "prompt", schema };

  afterEach(() => {
    delete process.env.LLM_ENABLED;
  });

  it("returns error when LLM is disabled", async () => {
    delete process.env.LLM_ENABLED;
    const result = await generateJSON(opts);
    expect(result.error).toBe("LLM features are disabled");
    expect(result.data).toBeNull();
  });
});
