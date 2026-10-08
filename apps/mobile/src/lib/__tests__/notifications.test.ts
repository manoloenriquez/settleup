import { describe, expect, it } from "vitest";
import { notificationGroupRoute } from "../notifications";

const GROUP = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("notificationGroupRoute", () => {
  it("routes to the group screen from group_id alone", () => {
    expect(notificationGroupRoute({ group_id: GROUP, event: "expense_added" })).toBe(`/groups/${GROUP}`);
  });

  it("honours a database-provided route that this build knows", () => {
    expect(notificationGroupRoute({ group_id: GROUP, route: `/groups/${GROUP}` })).toBe(`/groups/${GROUP}`);
  });

  it("falls back to the group screen for routes this build does not know", () => {
    expect(notificationGroupRoute({ group_id: GROUP, route: `/groups/${GROUP}/settle-up` })).toBe(
      `/groups/${GROUP}`,
    );
    expect(notificationGroupRoute({ group_id: GROUP, route: "https://evil.example/" })).toBe(`/groups/${GROUP}`);
  });

  it("ignores payloads without a valid group id", () => {
    expect(notificationGroupRoute({})).toBeNull();
    expect(notificationGroupRoute({ group_id: "not-a-uuid", route: `/groups/${GROUP}` })).toBeNull();
    expect(notificationGroupRoute({ group_id: 42 })).toBeNull();
  });
});
