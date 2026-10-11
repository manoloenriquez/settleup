import { beforeEach, describe, expect, it, vi } from "vitest";

// The bridge reads Platform.OS and the optional native module; both are
// replaced here so the availability and envelope logic runs under node.
const nativeState: { module: Record<string, (...args: string[]) => Promise<string>> | null } = { module: null };
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../../../modules/apple-intelligence", () => ({
  getNativeModule: () => nativeState.module,
  isNativeModuleLinked: () => nativeState.module !== null,
}));

const { getAvailability, describeUnavailable, describeError, analyzeReceipt, summarizeInsights } = await import("@/lib/ai/apple-intelligence");

const report = (status: string) =>
  JSON.stringify({ ok: true, data: { status, contextSize: status === "available" ? 4096 : null, supportsVision: true, supportsGuidedGeneration: true, supportsToolCalling: true } });

describe("getAvailability", () => {
  beforeEach(() => {
    nativeState.module = null;
  });

  it("reports unsupported when the native module is not linked", async () => {
    expect(await getAvailability()).toEqual({ status: "unsupported", contextSize: null, supportsVision: false });
  });

  it("passes through every native status", async () => {
    for (const status of ["available", "deviceNotEligible", "appleIntelligenceNotEnabled", "modelNotReady"] as const) {
      nativeState.module = { getAvailability: async () => report(status) };
      const availability = await getAvailability();
      expect(availability.status).toBe(status);
      expect(availability.contextSize).toBe(status === "available" ? 4096 : null);
    }
  });

  it("treats a broken bridge as unavailable instead of throwing", async () => {
    nativeState.module = { getAvailability: async () => "not json" };
    expect((await getAvailability()).status).toBe("unavailable");
    nativeState.module = {
      getAvailability: async () => {
        throw new Error("boom");
      },
    };
    expect((await getAvailability()).status).toBe("unavailable");
  });
});

describe("user-facing copy", () => {
  it("explains every non-available state without mentioning a server", () => {
    for (const status of ["deviceNotEligible", "appleIntelligenceNotEnabled", "modelNotReady", "unavailable", "unsupported"] as const) {
      const text = describeUnavailable(status);
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/server|cloud|upload/i);
    }
    expect(describeUnavailable("available")).toBe("");
    expect(describeUnavailable("appleIntelligenceNotEnabled")).toMatch(/Settings/);
  });

  it("maps error codes to copy and keeps the caller's fallback for generic failures", () => {
    expect(describeError("unreadableImage", "x")).toMatch(/Retake/);
    expect(describeError("contextExceeded", "x")).toMatch(/too long/);
    expect(describeError("failed", "fallback text")).toBe("fallback text");
  });
});

describe("envelope handling", () => {
  it("returns typed failures from the native envelope", async () => {
    nativeState.module = {
      analyzeReceipt: async () => JSON.stringify({ ok: false, code: "unreadableImage", message: "No text" }),
    };
    const result = await analyzeReceipt("file:///receipt.jpg");
    expect(result).toEqual({ data: null, error: "No text", code: "unreadableImage" });
  });

  it("validates successful payloads and tolerates omitted null fields", async () => {
    nativeState.module = {
      analyzeReceipt: async () =>
        JSON.stringify({
          ok: true,
          data: {
            total: 1199,
            items: [{ name: "Beer", totalPrice: 420 }],
            ocrRows: ["Beer  420.00", "Total  1,199.00"],
            strategy: "ocr-text",
            ocrMs: 1,
            modelMs: 2,
            inputTokens: 3,
            outputTokens: 4,
          },
        }),
      summarizeInsights: async () => JSON.stringify({ ok: true, data: { summary: "Nice trip.", usage: { inputTokens: 1, outputTokens: 1, modelMs: 1 } } }),
    };
    const result = await analyzeReceipt("file:///receipt.jpg");
    expect(result.error).toBeNull();
    expect(result.data?.merchant).toBeNull();
    expect(result.data?.items[0]).toEqual({ name: "Beer", quantity: null, unitPrice: null, totalPrice: 420 });
    expect(await summarizeInsights("facts")).toEqual({ data: "Nice trip.", error: null, code: null });
  });

  it("rejects payloads that fail validation", async () => {
    nativeState.module = { analyzeReceipt: async () => JSON.stringify({ ok: true, data: { items: "nope" } }) };
    const result = await analyzeReceipt("file:///receipt.jpg");
    expect(result.data).toBeNull();
    expect(result.code).toBe("bridge");
  });
});
