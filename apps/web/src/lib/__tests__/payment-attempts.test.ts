import { describe, expect, it } from "vitest";
import {
  preparePaymentAttempt,
  readPaymentAttempt,
  markPaymentAttemptSubmitted,
} from "../payment-attempts";

describe("durable payment report identity", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("reuses the same ID after a lost response and restores the submitted state", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const attempt = preparePaymentAttempt(
      storage,
      "report",
      { amountCents: 100, note: "" },
      () => id,
    );
    expect(
      preparePaymentAttempt(storage, "report", { amountCents: 100, note: "" }, () => "another-id")
        .id,
    ).toBe(id);
    expect(() =>
      preparePaymentAttempt(storage, "report", { amountCents: 200, note: "" }, () => id),
    ).toThrow("cannot change");
    markPaymentAttemptSubmitted(storage, "report", attempt);
    expect(readPaymentAttempt(storage, "report")?.submitted).toBe(true);
  });
  it("fails before submission when the attempt cannot be persisted", () => {
    expect(() =>
      preparePaymentAttempt(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("Storage full");
          },
        },
        "report",
        { amountCents: 100, note: "" },
        () => id,
      ),
    ).toThrow("Storage full");
  });
});
