import type { AssistantSnapshot, SnapshotExpense, SnapshotGroup } from "../assistant/types";

// A signed-in user ("Paolo") with four ledgers. Ids sort in the order written
// so equal-split remainders are predictable.
export const ME_BALI = "b0000000-0000-0000-0000-000000000001";
export const SARAH_BALI = "b0000000-0000-0000-0000-000000000002";
export const JOHN_BALI = "b0000000-0000-0000-0000-000000000003";
export const MARK_BALI = "b0000000-0000-0000-0000-000000000004";

export const ME_BK = "c0000000-0000-0000-0000-000000000001";
export const JOHN_R = "c0000000-0000-0000-0000-000000000002";
export const JOHN_S = "c0000000-0000-0000-0000-000000000003";
export const SARAH_BK = "c0000000-0000-0000-0000-000000000004";

export const ME_MARK = "d0000000-0000-0000-0000-000000000001";
export const MARK_D = "d0000000-0000-0000-0000-000000000002";

export const ME_TOKYO = "e0000000-0000-0000-0000-000000000001";
export const SARAH_TOKYO = "e0000000-0000-0000-0000-000000000002";

function expense(e: Partial<SnapshotExpense> & Pick<SnapshotExpense, "id" | "groupId" | "description" | "amountMinor" | "date" | "payers" | "shares">): SnapshotExpense {
  return {
    currency: "PHP",
    createdAt: `${e.date}T12:00:00Z`,
    updatedAt: `${e.date}T12:00:00Z`,
    createdByMe: false,
    itemized: false,
    categoryId: null,
    notes: null,
    ...e,
  };
}

const bali: SnapshotGroup = {
  id: "g-bali",
  name: "Bali Trip",
  currency: "PHP",
  isDirect: false,
  friendName: null,
  myMemberId: ME_BALI,
  myRole: "owner",
  archived: false,
  members: [
    { id: ME_BALI, name: "Paolo", isMe: true, hasAccount: true },
    { id: SARAH_BALI, name: "Sarah", isMe: false, hasAccount: true, userId: "user-sarah" },
    { id: JOHN_BALI, name: "John Cruz", isMe: false, hasAccount: false },
    { id: MARK_BALI, name: "Mark", isMe: false, hasAccount: false, userId: null },
  ],
  expenses: [
    expense({
      id: "x-dinner",
      groupId: "g-bali",
      description: "Dinner at Locavore",
      amountMinor: 360000,
      date: "2026-10-07",
      createdByMe: true,
      payers: [{ memberId: ME_BALI, amountMinor: 360000 }],
      shares: [ME_BALI, SARAH_BALI, JOHN_BALI, MARK_BALI].map((memberId) => ({ memberId, shareCents: 90000 })),
    }),
    expense({
      id: "x-grab",
      groupId: "g-bali",
      description: "Grab ride",
      amountMinor: 45000,
      date: "2026-10-07",
      createdAt: "2026-10-07T13:00:00Z",
      createdByMe: true,
      payers: [{ memberId: ME_BALI, amountMinor: 45000 }],
      shares: [
        { memberId: ME_BALI, shareCents: 22500 },
        { memberId: SARAH_BALI, shareCents: 22500 },
      ],
    }),
    expense({
      id: "x-hotel",
      groupId: "g-bali",
      description: "Hotel",
      amountMinor: 1200000,
      date: "2026-10-05",
      payers: [{ memberId: JOHN_BALI, amountMinor: 1200000 }],
      shares: [ME_BALI, SARAH_BALI, JOHN_BALI, MARK_BALI].map((memberId) => ({ memberId, shareCents: 300000 })),
    }),
  ],
  expensesComplete: true,
  // Paolo paid 405,000, owes 322,500 → +82,500. Sarah owes 322,500. John paid
  // 1,200,000, owes 300,000 → +900,000. Mark owes 390,000. Sums to 0.
  balances: [
    {
      currency: "PHP",
      net: [
        { memberId: ME_BALI, amountMinor: 82500 },
        { memberId: SARAH_BALI, amountMinor: -322500 },
        { memberId: JOHN_BALI, amountMinor: 630000 },
        { memberId: MARK_BALI, amountMinor: -390000 },
      ],
    },
  ],
};

const barkada: SnapshotGroup = {
  id: "g-barkada",
  name: "Barkada",
  currency: "PHP",
  isDirect: false,
  friendName: null,
  myMemberId: ME_BK,
  myRole: "member",
  archived: false,
  members: [
    { id: ME_BK, name: "Paolo", isMe: true, hasAccount: true },
    { id: JOHN_R, name: "John Reyes", isMe: false, hasAccount: true },
    { id: JOHN_S, name: "John Santos", isMe: false, hasAccount: false },
    { id: SARAH_BK, name: "Sarah", isMe: false, hasAccount: true, userId: "user-sarah" },
  ],
  expenses: [],
  expensesComplete: true,
  balances: [
    {
      currency: "PHP",
      net: [
        { memberId: ME_BK, amountMinor: -50000 },
        { memberId: JOHN_R, amountMinor: 0 },
        { memberId: JOHN_S, amountMinor: 0 },
        { memberId: SARAH_BK, amountMinor: 50000 },
      ],
    },
  ],
};

const markDirect: SnapshotGroup = {
  id: "g-mark",
  name: "Paolo & Mark",
  currency: "PHP",
  isDirect: true,
  friendName: "Mark",
  myMemberId: ME_MARK,
  myRole: "owner",
  archived: false,
  members: [
    { id: ME_MARK, name: "Paolo", isMe: true, hasAccount: true },
    { id: MARK_D, name: "Mark", isMe: false, hasAccount: true, userId: "user-mark" },
  ],
  expenses: [],
  expensesComplete: true,
  balances: [{ currency: "PHP", net: [{ memberId: ME_MARK, amountMinor: 20000 }, { memberId: MARK_D, amountMinor: -20000 }] }],
};

const tokyo: SnapshotGroup = {
  id: "g-tokyo",
  name: "Tokyo 2026",
  currency: "JPY",
  isDirect: false,
  friendName: null,
  myMemberId: ME_TOKYO,
  myRole: "admin",
  archived: false,
  members: [
    { id: ME_TOKYO, name: "Paolo", isMe: true, hasAccount: true },
    { id: SARAH_TOKYO, name: "Sarah", isMe: false, hasAccount: true, userId: "user-sarah" },
  ],
  expenses: [],
  expensesComplete: true,
  balances: [{ currency: "JPY", net: [{ memberId: ME_TOKYO, amountMinor: 3000 }, { memberId: SARAH_TOKYO, amountMinor: -3000 }] }],
};

export function fixtureSnapshot(overrides: Partial<AssistantSnapshot> = {}): AssistantSnapshot {
  return {
    today: "2026-10-08",
    isGuest: false,
    online: true,
    myName: "Paolo",
    defaultCurrency: "PHP",
    groups: [structuredClone(bali), structuredClone(barkada), structuredClone(markDirect), structuredClone(tokyo)],
    personal: [
      { id: "p-coffee", description: "Coffee", amountMinor: 18000, currency: "PHP", date: "2026-10-03", category: "food-drinks" },
      { id: "p-books", description: "Books", amountMinor: 120000, currency: "PHP", date: "2026-09-20", category: "shopping" },
    ],
    ...overrides,
  };
}
