// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SharedLinkSection } from "../SharedLinkSection";

const setGroupLinkEnabled = vi.fn();
const regenerateGroupLink = vi.fn();
const setHideMyPaymentDetails = vi.fn();
vi.mock("@/app/actions/collaboration", () => ({
  setGroupLinkEnabled: (id: string, on: boolean) => setGroupLinkEnabled(id, on),
  regenerateGroupLink: (id: string) => regenerateGroupLink(id),
  setHideMyPaymentDetails: (id: string, hidden: boolean) => setHideMyPaymentDetails(id, hidden),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(): void {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(): void {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const GROUP = "00000000-0000-4000-8000-0000000000aa";

function mount(props: Partial<React.ComponentProps<typeof SharedLinkSection>> = {}): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SharedLinkSection groupId={GROUP} shareEnabled shareToken="old" canManage myHidden={false} {...props} />
    </QueryClientProvider>,
  );
}

function confirmDialog(label: string): void {
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: label }));
}

describe("group shared link on web", () => {
  it("shows the link when on and nothing to copy when off", () => {
    mount();
    expect(screen.getByText("Shared link is on")).toBeTruthy();
    expect((screen.getByLabelText("Group link") as HTMLInputElement).value).toMatch(/\/g\/old$/);
    cleanup();
    mount({ shareEnabled: false });
    expect(screen.getByText("Shared link is off")).toBeTruthy();
    expect(screen.queryByLabelText("Group link")).toBeNull();
    expect(screen.getByRole("button", { name: "Turn on link" })).toBeTruthy();
  });

  it("turns the link off after confirming", async () => {
    setGroupLinkEnabled.mockResolvedValue({ data: { shareEnabled: false, shareToken: null }, error: null });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Turn off link" }));
    confirmDialog("Turn off");
    await waitFor(() => expect(setGroupLinkEnabled).toHaveBeenCalledWith(GROUP, false));
    await screen.findByText("Shared link is off");
    expect(refresh).toHaveBeenCalled();
  });

  it("makes a new link and shows it", async () => {
    regenerateGroupLink.mockResolvedValue({ data: { shareEnabled: true, shareToken: "new" }, error: null });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Make a new link" }));
    confirmDialog("Make new link");
    await waitFor(() => expect((screen.getByLabelText("Group link") as HTMLInputElement).value).toMatch(/\/g\/new$/));
  });

  it("members who aren't admins can't change the link", () => {
    mount({ canManage: false });
    expect(screen.queryByRole("button", { name: "Turn off link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Make a new link" })).toBeNull();
  });

  it("shows the server's refusal and keeps the link on", async () => {
    setGroupLinkEnabled.mockResolvedValue({ data: null, error: "Only group admins can change the shared link." });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Turn off link" }));
    confirmDialog("Turn off");
    expect((await screen.findByRole("alert")).textContent).toContain("Only group admins");
    expect(screen.getByText("Shared link is on")).toBeTruthy();
  });

  it("no privacy switch when I'm not a member", () => {
    mount({ myHidden: null });
    expect(screen.queryByLabelText(/Hide my payment details/)).toBeNull();
  });
});
