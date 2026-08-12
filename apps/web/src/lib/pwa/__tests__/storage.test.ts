import { describe, expect, it, vi } from "vitest";
import { ensurePersistentStorage } from "../storage";

describe("ensurePersistentStorage", () => {
  it("returns false when the Storage API is unavailable", async () => {
    await expect(ensurePersistentStorage(undefined)).resolves.toBe(false);
  });

  it("does not request persistence when storage is already durable", async () => {
    const persist = vi.fn(async () => false);

    await expect(
      ensurePersistentStorage({
        persisted: async () => true,
        persist,
      }),
    ).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("requests persistence when storage is not yet durable", async () => {
    const persist = vi.fn(async () => true);

    await expect(
      ensurePersistentStorage({
        persisted: async () => false,
        persist,
      }),
    ).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("falls back to the persistence request when the status check fails", async () => {
    const persist = vi.fn(async () => true);

    await expect(
      ensurePersistentStorage({
        persisted: async () => {
          throw new Error("status unavailable");
        },
        persist,
      }),
    ).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("returns false when the persistence request fails", async () => {
    await expect(
      ensurePersistentStorage({
        persist: async () => {
          throw new Error("request unavailable");
        },
      }),
    ).resolves.toBe(false);
  });
});
