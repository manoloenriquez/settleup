import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit } from "../rate-limit";

// Each test uses a unique userId to avoid cross-test store contamination.
let userCounter = 0;
function uid(): string {
  return `user-rate-${++userCounter}`;
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request", () => {
    const result = checkRateLimit(uid());
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  it("allows 10 consecutive requests", () => {
    const id = uid();
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(id).allowed).toBe(true);
    }
  });

  it("rejects the 11th request", () => {
    const id = uid();
    for (let i = 0; i < 10; i++) checkRateLimit(id);
    const result = checkRateLimit(id);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("retryAfterMs is positive after exhausting the limit", () => {
    const id = uid();
    for (let i = 0; i < 10; i++) checkRateLimit(id);
    const { retryAfterMs } = checkRateLimit(id);
    expect(retryAfterMs).toBeGreaterThan(0);
  });

  it("allows requests again after the 60s window resets", () => {
    const id = uid();
    for (let i = 0; i < 10; i++) checkRateLimit(id);
    vi.advanceTimersByTime(60001);
    expect(checkRateLimit(id).allowed).toBe(true);
  });

  it("rate limits are independent per user", () => {
    const idA = uid();
    const idB = uid();
    for (let i = 0; i < 10; i++) checkRateLimit(idA);
    expect(checkRateLimit(idA).allowed).toBe(false);
    // idB should still have 10 requests available
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(idB).allowed).toBe(true);
    }
  });

  it("counter does not reset mid-window (30s)", () => {
    const id = uid();
    for (let i = 0; i < 9; i++) checkRateLimit(id);
    vi.advanceTimersByTime(30000);
    expect(checkRateLimit(id).allowed).toBe(true); // 10th request
    expect(checkRateLimit(id).allowed).toBe(false); // 11th blocked
  });
});
