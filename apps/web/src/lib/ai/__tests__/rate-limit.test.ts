import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  createDatabaseRateLimitBackend,
  createMemoryRateLimitBackend,
  setRateLimitBackendForTests,
} from "../rate-limit";

// Each test uses a unique userId to avoid cross-test store contamination.
let userCounter = 0;
function uid(): string {
  return `user-rate-${++userCounter}`;
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setRateLimitBackendForTests(createMemoryRateLimitBackend());
  });

  afterEach(() => {
    vi.useRealTimers();
    setRateLimitBackendForTests(null);
  });

  it("allows the first request", async () => {
    const result = await checkRateLimit(uid());
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  it("allows 10 consecutive requests", async () => {
    const id = uid();
    for (let i = 0; i < 10; i++) {
      expect((await checkRateLimit(id)).allowed).toBe(true);
    }
  });

  it("rejects the 11th request", async () => {
    const id = uid();
    for (let i = 0; i < 10; i++) await checkRateLimit(id);
    const result = await checkRateLimit(id);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("retryAfterMs is positive after exhausting the limit", async () => {
    const id = uid();
    for (let i = 0; i < 10; i++) await checkRateLimit(id);
    const { retryAfterMs } = await checkRateLimit(id);
    expect(retryAfterMs).toBeGreaterThan(0);
  });

  it("allows requests again after the 60s window resets", async () => {
    const id = uid();
    for (let i = 0; i < 10; i++) await checkRateLimit(id);
    vi.advanceTimersByTime(60001);
    expect((await checkRateLimit(id)).allowed).toBe(true);
  });

  it("rate limits are independent per user", async () => {
    const idA = uid();
    const idB = uid();
    for (let i = 0; i < 10; i++) await checkRateLimit(idA);
    expect((await checkRateLimit(idA)).allowed).toBe(false);
    // idB should still have 10 requests available
    for (let i = 0; i < 10; i++) {
      expect((await checkRateLimit(idB)).allowed).toBe(true);
    }
  });

  it("counter does not reset mid-window (30s)", async () => {
    const id = uid();
    for (let i = 0; i < 9; i++) await checkRateLimit(id);
    vi.advanceTimersByTime(30000);
    expect((await checkRateLimit(id)).allowed).toBe(true); // 10th request
    expect((await checkRateLimit(id)).allowed).toBe(false); // 11th blocked
  });
});

describe("database rate limit backend", () => {
  it("passes through the shared limiter decision", async () => {
    const backend = createDatabaseRateLimitBackend(async () => ({
      data: { allowed: false, retry_after_ms: 1234 },
      error: null,
    }));
    expect(await backend.consumeRateLimit("u")).toEqual({ allowed: false, retryAfterMs: 1234 });
  });

  it("denies the request when the RPC errors instead of falling back to memory", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const backend = createDatabaseRateLimitBackend(async () => ({
      data: null,
      error: { message: "connection refused" },
    }));
    const result = await backend.consumeRateLimit("u");
    expect(result.allowed).toBe(false);
    expect(result.unavailable).toBe(true);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    errorSpy.mockRestore();
  });

  it("denies the request when the RPC result has an unexpected shape", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const backend = createDatabaseRateLimitBackend(async () => ({ data: "yes", error: null }));
    expect((await backend.consumeRateLimit("u")).unavailable).toBe(true);
    errorSpy.mockRestore();
  });

  it("denies the request when the RPC throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const backend = createDatabaseRateLimitBackend(async () => {
      throw new Error("network");
    });
    expect((await backend.consumeRateLimit("u")).unavailable).toBe(true);
    errorSpy.mockRestore();
  });
});
