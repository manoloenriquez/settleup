// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CreditorPaymentProfile, FriendViewPayload } from "@template/shared";
import { ProfilePaymentDetails } from "../ProfilePaymentDetails";
import { FriendView } from "../FriendView";

vi.mock("@/app/actions/analytics", () => ({ trackPublicEvent: vi.fn() }));
vi.mock("@/app/actions/friend-payments", () => ({ reportFriendPayment: vi.fn() }));
vi.mock("../IvePaidButton", () => ({ IvePaidButton: () => <button>I&apos;ve paid</button> }));

afterEach(cleanup);

const profile = (patch: Partial<CreditorPaymentProfile>): CreditorPaymentProfile => ({
  member_id: "m-carla",
  display_name: "Carla",
  gcash_name: "Carla R.",
  gcash_number: "09171234567",
  gcash_qr_url: null,
  bank_name: null,
  bank_account_name: null,
  bank_account_number: null,
  bank_qr_url: null,
  notes: null,
  ...patch,
});

describe("payment details on a personal link", () => {
  it("never offers to copy a masked number", () => {
    render(
      <ProfilePaymentDetails
        pp={profile({ gcash_number: "****4567" })}
        shareToken="t"
        ownerName="Carla"
      />,
    );
    expect(screen.getByText("account ending in 4567")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
    expect(screen.getByText(/ask Carla for the full number/)).toBeTruthy();
  });

  it("offers Copy for a full number", () => {
    render(<ProfilePaymentDetails pp={profile({})} shareToken="t" ownerName="Carla" />);
    expect(screen.getByText("09171234567")).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
  });

  it("labels details an organizer typed in", () => {
    render(
      <ProfilePaymentDetails
        pp={profile({ source: "organizer" })}
        shareToken="t"
        ownerName="Carla"
      />,
    );
    expect(screen.getByText(/Added by the group organizer — not confirmed by Carla/)).toBeTruthy();
  });
});

const payload = (net: number): FriendViewPayload => ({
  currency_code: "PHP",
  group: { id: "g", name: "Flat 2B" },
  member: { id: "m-carla", display_name: "Carla" },
  net_cents: net,
  owed_cents: Math.max(0, -net),
  payment_profile: null,
  all_balances: [],
  creditor_profiles: [],
  expenses: [],
});

describe("personal link headline", () => {
  it("tells a creditor what they are owed, not that everything is settled", () => {
    render(
      <FriendView
        views={[{ currency: "PHP", payload: payload(90000) }]}
        shareLink="https://x/p/t"
        shareToken="t"
      />,
    );
    expect(screen.getByText(/₱900\.00 to you/)).toBeTruthy();
    expect(screen.queryByText(/All settled!/)).toBeNull();
  });

  it("shows the amount a debtor owes", () => {
    render(
      <FriendView
        views={[{ currency: "PHP", payload: payload(-45000) }]}
        shareLink="https://x/p/t"
        shareToken="t"
      />,
    );
    expect(screen.getAllByText("₱450.00").length).toBeGreaterThan(0);
  });

  it("says settled when nobody owes anything", () => {
    render(
      <FriendView
        views={[{ currency: "PHP", payload: payload(0) }]}
        shareLink="https://x/p/t"
        shareToken="t"
      />,
    );
    expect(screen.getByText("All settled!")).toBeTruthy();
  });
});
