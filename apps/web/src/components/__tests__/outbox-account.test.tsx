// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { createAccountOutboxStorage, type NewOutboxEntry } from "@template/shared";
import { OutboxProvider, useWebOutbox } from "../OutboxProvider";

const mocks = vi.hoisted(() => ({
  listener: null as
    | ((event: string, session: { user: { id: string }; access_token: string } | null) => void)
    | null,
  storage: new Map<string, unknown>(),
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
vi.mock("@/lib/outbox/storage", () => ({
  hasLegacyOutbox: async () => false,
  outboxStorageFor: (ownerId: string) =>
    createAccountOutboxStorage("project", ownerId, {
      get: async (key) => mocks.storage.get(key) ?? null,
      set: async (key, value) => {
        mocks.storage.set(key, structuredClone(value));
      },
    }),
}));
vi.mock("@/lib/pwa/storage", () => ({ requestPersistentStorage: async () => false }));
vi.mock("@sentry/nextjs", () => ({ addBreadcrumb: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const pending: NewOutboxEntry = {
  id: "alice-expense",
  entityId: "alice-expense",
  groupId: "trip",
  kind: "expense.create",
  payload: { item_name: "Lunch", amount_cents: 1200 },
  createdAt: "2026-09-09T00:00:00Z",
  summary: { title: "Lunch", amountCents: 1200 },
};
let oldEnqueue: ((input: NewOutboxEntry) => Promise<void>) | undefined;
function PendingProbe(): React.ReactElement {
  const { entries, enqueue } = useWebOutbox();
  return (
    <>
      <p>{entries.length ? entries.map((entry) => entry.id).join(",") : "No pending changes"}</p>
      <button
        onClick={() => {
          oldEnqueue = enqueue;
          void enqueue(pending);
        }}
      >
        Queue lunch
      </button>
    </>
  );
}
function signIn(id: string | null): void {
  act(() => {
    mocks.listener?.("SIGNED_IN", id ? { user: { id }, access_token: `${id}-token` } : null);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.storage.clear();
  oldEnqueue = undefined;
});

it("hides and preserves saved work across sign-out/account switches and rejects stale callbacks", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_name: string, run: () => Promise<unknown>) => run() },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OutboxProvider>
        <PendingProbe />
      </OutboxProvider>
    </QueryClientProvider>,
  );
  signIn("alice");
  fireEvent.click(screen.getByText("Queue lunch"));
  await screen.findByText("alice-expense");
  const staleEnqueue = oldEnqueue;
  signIn(null);
  expect(screen.getByText("No pending changes")).toBeTruthy();
  signIn("bob");
  await waitFor(() => expect(screen.getByText("No pending changes")).toBeTruthy());
  await expect(staleEnqueue?.({ ...pending, id: "stale" })).rejects.toThrow("Sign in");
  signIn("alice");
  await screen.findByText("alice-expense");
});
