import { afterEach, expect, it, vi } from "vitest";
import { createTokenClient } from "@template/supabase";

afterEach(() => vi.unstubAllGlobals());

it("sends only the captured user JWT without consulting another client's session", async () => {
  const authorization: Array<string | null> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      authorization.push(new Headers(init?.headers).get("authorization"));
      return new Response("false", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  const alice = createTokenClient("https://example.invalid", "test-anon-key", "alice-captured-jwt");
  const bob = createTokenClient("https://example.invalid", "test-anon-key", "bob-captured-jwt");
  await bob.schema("settleup").rpc("is_account_closed");
  await alice.schema("settleup").rpc("is_account_closed");
  expect(authorization).toEqual(["Bearer bob-captured-jwt", "Bearer alice-captured-jwt"]);
});
