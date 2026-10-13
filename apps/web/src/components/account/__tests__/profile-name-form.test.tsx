// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfileNameForm } from "../ProfileNameForm";

const updateMyProfile = vi.fn();
vi.mock("@/app/actions/profile", () => ({
  updateMyProfile: (update: { full_name: string }) => updateMyProfile(update),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("editing my display name", () => {
  it("saves the trimmed name and refreshes", async () => {
    updateMyProfile.mockResolvedValue({ data: { full_name: "Ana Cruz" }, error: null });
    render(<ProfileNameForm initialName="Ana" />);
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "  Ana Cruz " } });
    fireEvent.click(save);
    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({ full_name: "Ana Cruz" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the server's error", async () => {
    updateMyProfile.mockResolvedValue({ data: null, error: "Update failed." });
    render(<ProfileNameForm initialName={null} />);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Ben" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Update failed.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
