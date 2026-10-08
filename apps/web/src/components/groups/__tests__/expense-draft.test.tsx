// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GroupMember } from "@template/supabase";
import type { ExpenseDraft } from "@template/shared";
import { formatCurrency } from "@/lib/currency";
import { AddExpenseDialog } from "../AddExpenseDialog";

vi.mock("@/app/actions/expenses", () => ({
  addExpense: vi.fn(),
  addExpensesBatch: vi.fn(),
  addItemizedExpense: vi.fn(),
}));
vi.mock("@/app/actions/recurring", () => ({ createRecurringExpense: vi.fn() }));
vi.mock("@/components/OutboxProvider", () => ({
  useWebOutbox: () => ({ enqueue: vi.fn(), enqueueBatch: vi.fn() }),
}));
vi.mock("../ReceiptUploader", () => ({ ReceiptUploader: () => <span>Receipt scanner</span> }));
vi.mock("../ConversationInput", () => ({
  ConversationInput: ({ onDraft }: { onDraft: (draft: ExpenseDraft) => void }) => (
    <button
      onClick={() =>
        onDraft({
          item_name: "Dinner",
          amount_cents: 1001,
          participant_names: ["Ana", "Unknown"],
          payer_name: "Unknown",
          confidence: 0.9,
          category_slug: null,
          notes: "Window table",
          date: "2026-09-01",
          source: "conversation",
        })
      }
    >
      Test AI suggestion
    </button>
  ),
}));

const members: GroupMember[] = ["Ana", "Sam"].map((name, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`,
  display_name: name,
  user_id: index === 0 ? "owner" : null,
  departed_at: null,
  group_id: "group",
  slug: name,
  share_token: "view-token",
  role: index === 0 ? "owner" : "member",
  hide_payment_details: false,
  created_at: "",
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(): void {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(): void {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

function mount(): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddExpenseDialog
        open
        onClose={() => undefined}
        groupId="group"
        members={members}
        categories={[]}
        currentUserId="owner"
        defaultCurrency="PHP"
      />
    </QueryClientProvider>,
  );
}

describe("one expense draft across entry modes", () => {
  it("preserves entered amount, description and participants when switching Quick to Detailed and back", () => {
    mount();
    const quick = within(screen.getByRole("tabpanel", { name: "Quick" }));
    fireEvent.change(quick.getByLabelText("Amount"), { target: { value: "123.45" } });
    fireEvent.change(quick.getByLabelText("Description"), { target: { value: "Train tickets" } });
    fireEvent.click(screen.getByRole("tab", { name: "Detailed" }));
    const detail = screen.getByRole("tabpanel", { name: "Detailed" });
    expect(within(detail).getByDisplayValue("123.45")).toBeTruthy();
    expect(within(detail).getByDisplayValue("Train tickets")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Quick" }));
    expect(
      within(screen.getByRole("tabpanel", { name: "Quick" })).getByDisplayValue("123.45"),
    ).toBeTruthy();
  });

  it("requires correction of unknown AI names and prefills the editable draft", () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Test AI suggestion" }));
    const reviewButton = screen.getByRole("button", { name: "Edit and review before saving" });
    expect(reviewButton.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Resolved payer"), {
      target: { value: members[0]!.id },
    });
    fireEvent.change(screen.getByLabelText("Resolved participant 2"), {
      target: { value: members[1]!.id },
    });
    expect(reviewButton.hasAttribute("disabled")).toBe(false);
    expect(
      screen.getByText(`Share: ${formatCurrency(501, "PHP")}`, { exact: false }),
    ).toBeTruthy();
    fireEvent.click(reviewButton);
    const detail = within(screen.getByRole("tabpanel", { name: "Detailed" }));
    expect(detail.getByDisplayValue("Dinner")).toBeTruthy();
    expect(detail.getByDisplayValue("10.01")).toBeTruthy();
    expect(detail.getByDisplayValue("Window table")).toBeTruthy();
    expect(detail.getByDisplayValue("2026-09-01")).toBeTruthy();
  });
});
