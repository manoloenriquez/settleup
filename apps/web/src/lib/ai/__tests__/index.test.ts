import { describe, it, expect, afterEach } from "vitest";
import { isLLMEnabled, generateJSON } from "../index";
import { z } from "zod";

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
  const opts = { system: "sys", prompt: "prompt", schema, userId: "test-gen" };

  afterEach(() => {
    delete process.env.LLM_ENABLED;
  });

  it("returns error when LLM is disabled", async () => {
    delete process.env.LLM_ENABLED;
    const result = await generateJSON(opts);
    expect(result.error).toBe("LLM features are disabled");
    expect(result.data).toBeNull();
  });

  it("returns rate limit error after exhausting per-user limit", async () => {
    process.env.LLM_ENABLED = "true";
    // Use a unique userId so we don't collide with other test files.
    // We need to exhaust the rate limit (10 requests) but generateJSON will
    // fail at provider creation since no API key is configured.
    // Instead, test directly via checkRateLimit exhaustion pattern:
    // Import checkRateLimit and exhaust it first, then call generateJSON.
    const { checkRateLimit } = await import("../rate-limit");
    const userId = "index-test-ratelimit-user";
    for (let i = 0; i < 10; i++) checkRateLimit(userId);
    const result = await generateJSON({ ...opts, userId });
    expect(result.error).toMatch(/Rate limited/);
    expect(result.data).toBeNull();
  });

  it("rate limit error message contains retry time in seconds", async () => {
    process.env.LLM_ENABLED = "true";
    const { checkRateLimit } = await import("../rate-limit");
    const userId = "index-test-ratelimit-user-2";
    for (let i = 0; i < 10; i++) checkRateLimit(userId);
    const result = await generateJSON({ ...opts, userId });
    expect(result.error).toMatch(/\d+s/);
  });
});
