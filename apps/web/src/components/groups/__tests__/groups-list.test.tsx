// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { GroupWithStats } from "@template/shared";
import { GroupsClient } from "../GroupsClient";

const row = (id: string, name: string, kind?: "shared" | "direct"): GroupWithStats => ({
  id,
  name,
  owner_user_id: "me",
  invite_code: "abc123abc123",
  is_archived: false,
  share_token: "t",
  budget_cents: null,
  created_at: "2026-10-01T00:00:00Z",
  default_currency_code: "PHP",
  member_count: 2,
  pending_count: 0,
  total_owed_cents: 0,
  ...(kind ? { kind } : {}),
});

let groups: GroupWithStats[] = [];
vi.mock("@/hooks/queries", () => ({
  useGroupsWithStats: () => ({ data: groups, isError: false, error: null }),
  useArchivedGroups: () => ({ data: [] }),
}));
vi.mock("@/hooks/useOutboxPending", () => ({ usePendingGroups: () => [] }));
vi.mock("../GroupList", () => ({
  GroupList: ({ groups: list }: { groups: GroupWithStats[] }) => (
    <ul>{list.map((g) => <li key={g.id}>{g.name}</li>)}</ul>
  ),
}));
vi.mock("../ArchivedGroupsSection", () => ({ ArchivedGroupsSection: () => null }));

afterEach(cleanup);

describe("groups list", () => {
  it("lists friend ledgers under Friends, apart from groups", () => {
    groups = [row("g1", "Bali Trip", "shared"), row("g2", "Ana & Ben", "direct"), row("g3", "Rent")];
    render(<GroupsClient />);
    const friends = screen.getByRole("region", { name: "Friends" });
    expect(within(friends).getByText("Ana & Ben")).toBeTruthy();
    expect(within(friends).queryByText("Bali Trip")).toBeNull();
    // A row without a kind (an older cached list) stays with the groups.
    expect(screen.getAllByText("Rent")).toHaveLength(1);
    expect(within(friends).queryByText("Rent")).toBeNull();
  });

  it("shows no Friends section when there are none", () => {
    groups = [row("g1", "Bali Trip", "shared")];
    render(<GroupsClient />);
    expect(screen.queryByRole("region", { name: "Friends" })).toBeNull();
  });
});
