// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JoinGroupForm } from "../JoinGroupForm";

const previewInvite = vi.fn();
const joinGroup = vi.fn(async () => null);
vi.mock("@/app/actions/collaboration", () => ({
  previewInvite: (code: string) => previewInvite(code),
  joinGroup: () => joinGroup(),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const preview = (patch: object) => ({
  data: { group_name: "Bali", member_count: 3, already_member: false, group_id: null, your_name: "Ben", name_taken: false, ...patch },
  error: null,
});

describe("joining with a group code", () => {
  it("warns before adding a second person with the same name", async () => {
    previewInvite.mockResolvedValue(preview({ name_taken: true }));
    render(<JoinGroupForm initialCode="abc123abc123" />);
    fireEvent.click(screen.getByRole("button", { name: "Join Group" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/There's already a “Ben” in Bali/)).toBeTruthy();
    expect(joinGroup).not.toHaveBeenCalled();
  });

  it("opens the group when already a member", async () => {
    previewInvite.mockResolvedValue(preview({ already_member: true, group_id: "11111111-1111-4111-8111-111111111111" }));
    render(<JoinGroupForm initialCode="abc123abc123" />);
    fireEvent.click(screen.getByRole("button", { name: "Join Group" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/groups/11111111-1111-4111-8111-111111111111"));
    expect(joinGroup).not.toHaveBeenCalled();
  });
});
