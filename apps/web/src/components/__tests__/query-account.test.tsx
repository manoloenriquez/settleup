// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { QueryProvider } from "../QueryProvider";

const mocks = vi.hoisted(() => ({
  listener: null as ((event: string, session: { user: { id: string } } | null) => void) | null,
  router: { refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (listener: typeof mocks.listener) => {
        mocks.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("idb-keyval", () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
}));
let currentClient: QueryClient | undefined;
function BalanceProbe(): React.ReactElement {
  const client = useQueryClient();
  currentClient = client;
  return <p>{client.getQueryData<string>(["balances"]) ?? "Empty account cache"}</p>;
}
afterEach(() => {
  cleanup();
  currentClient = undefined;
});

it("hides stale server account content, detaches its cache, and waits for refreshed account props", async () => {
  const page = render(
    <QueryProvider ownerId="alice">
      <BalanceProbe />
    </QueryProvider>,
  );
  const alice = currentClient;
  alice?.setQueryData(["balances"], "Alice's balances");
  act(() => mocks.listener?.("SIGNED_IN", { user: { id: "bob" } }));
  expect(screen.getByText("Updating your account…")).toBeTruthy();
  expect(mocks.router.refresh).toHaveBeenCalled();
  page.rerender(
    <QueryProvider ownerId="bob">
      <BalanceProbe />
    </QueryProvider>,
  );
  expect(screen.getByText("Empty account cache")).toBeTruthy();
  expect(currentClient).not.toBe(alice);
  expect(currentClient?.getQueryData(["balances"])).toBeUndefined();
  act(() => mocks.listener?.("SIGNED_OUT", null));
  expect(mocks.router.replace).toHaveBeenCalledWith("/login");
});
