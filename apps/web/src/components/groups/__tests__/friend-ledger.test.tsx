// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GroupMember } from "@template/supabase";
import { GroupSettingsClient } from "../GroupSettingsClient";
import { MemberAvatarRow } from "../MemberAvatarRow";

const setHideMyPaymentDetails = vi.fn();
vi.mock("@/app/actions/collaboration", () => ({
  promoteMember: vi.fn(),
  regenerateInviteCode: vi.fn(),
  rotateShareToken: vi.fn(),
  setHideMyPaymentDetails: (groupId: string, hidden: boolean) => setHideMyPaymentDetails(groupId, hidden),
}));
vi.mock("@/app/actions/members", () => ({ addMember: vi.fn(), deleteMember: vi.fn(), renameMember: vi.fn() }));
vi.mock("@/app/actions/groups", () => ({
  archiveGroup: vi.fn(),
  deleteGroup: vi.fn(),
  leaveGroup: vi.fn(),
  renameGroup: vi.fn(),
  transferOwnership: vi.fn(),
}));
vi.mock("@/app/actions/categories", () => ({
  createExpenseCategory: vi.fn(),
  deleteExpenseCategory: vi.fn(),
  updateExpenseCategory: vi.fn(),
}));
vi.mock("../MemberInvitationControls", () => ({ MemberInvitationControls: () => <span>Invitation controls</span> }));
vi.mock("../AddMemberForm", () => ({ AddMemberForm: () => <span>Add member form</span> }));
vi.mock("@/components/OutboxProvider", () => ({ useWebOutbox: () => ({ enqueue: vi.fn() }) }));
vi.mock("@/hooks/useOnline", () => ({ useOnline: () => true }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const GROUP_ID = "00000000-0000-4000-8000-0000000000aa";
const member = (patch: Partial<GroupMember>): GroupMember => ({
  id: "00000000-0000-4000-8000-000000000001",
  display_name: "Ana",
  user_id: "me",
  departed_at: null,
  group_id: GROUP_ID,
  slug: "ana",
  share_token: "token",
  role: "owner",
  hide_payment_details: false,
  created_at: "",
  ...patch,
});

function mountSettings(kind: "shared" | "direct", members: GroupMember[]): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GroupSettingsClient
        group={{ id: GROUP_ID, name: "Ana & Ben", owner_user_id: "me", invite_code: "abc123abc123", share_token: "t", kind }}
        members={members}
        categories={[]}
        isOwner
        isAdmin={false}
        isAdminOrOwner
        currentUserId="me"
      />
    </QueryClientProvider>,
  );
}

const ana = member({});
const ben = member({ id: "00000000-0000-4000-8000-000000000002", display_name: "Ben", user_id: "ben", role: "member" });
const carla = member({ id: "00000000-0000-4000-8000-000000000003", display_name: "Carla", user_id: null, role: "member" });

describe("group settings on a friend ledger", () => {
  it("a shared group offers invites, adding, removing, leaving and the danger zone", () => {
    mountSettings("shared", [ana, ben, carla]);
    expect(screen.getByText("Invite to collaborate")).toBeTruthy();
    expect(screen.getByText("Invitation controls")).toBeTruthy();
    expect(screen.getByPlaceholderText("New member name…")).toBeTruthy();
    expect(screen.getAllByTitle("Remove member").length).toBeGreaterThan(0);
    expect(screen.getByText("Danger Zone")).toBeTruthy();
  });

  it("a friend ledger hides every control that would add, remove or end a member", () => {
    mountSettings("direct", [ana, ben]);
    expect(screen.queryByText("Invite to collaborate")).toBeNull();
    expect(screen.queryByPlaceholderText("New member name…")).toBeNull();
    expect(screen.queryByTitle("Remove member")).toBeNull();
    expect(screen.queryByText("Danger Zone")).toBeNull();
    expect(screen.queryByText("Leave Group")).toBeNull();
    expect(screen.getByText(/always just the two of you/)).toBeTruthy();
    // Renaming and the payment-details privacy switch stay (as on the iPhone).
    expect(screen.getByText("Group Name")).toBeTruthy();
    expect(screen.getByLabelText(/Hide my payment details in this group/)).toBeTruthy();
  });
});

describe("hiding my payment details in one group", () => {
  it("saves the switch and refreshes", async () => {
    setHideMyPaymentDetails.mockResolvedValue({ data: { hidden: true }, error: null });
    mountSettings("shared", [ana, ben]);
    const box = screen.getByLabelText(/Hide my payment details in this group/) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await waitFor(() => expect(setHideMyPaymentDetails).toHaveBeenCalledWith(GROUP_ID, true));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(box.checked).toBe(true);
  });

  it("puts the switch back when saving fails", async () => {
    setHideMyPaymentDetails.mockResolvedValue({ data: null, error: "Couldn't update this setting. Try again." });
    mountSettings("shared", [member({ hide_payment_details: true }), ben]);
    const box = screen.getByLabelText(/Hide my payment details in this group/) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await screen.findByRole("alert");
    expect(box.checked).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is not offered when I'm not a member of the group", () => {
    mountSettings("shared", [ben, carla]);
    expect(screen.queryByLabelText(/Hide my payment details in this group/)).toBeNull();
  });
});

describe("member avatar row", () => {
  it("offers Add only when adding is allowed", () => {
    const { rerender } = render(<MemberAvatarRow groupId={GROUP_ID} members={[ana, ben]} currentUserId="me" />);
    expect(screen.getByText("Add")).toBeTruthy();
    rerender(<MemberAvatarRow groupId={GROUP_ID} members={[ana, ben]} currentUserId="me" canAdd={false} />);
    expect(screen.queryByText("Add")).toBeNull();
  });
});
