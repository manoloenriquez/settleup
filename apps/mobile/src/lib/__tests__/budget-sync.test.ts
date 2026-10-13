import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { isMissingBudgetBackend } from "@/services/budget";

describe("budget sync errors", () => {
  it("treats only a missing table or function as 'backup not available yet'", () => {
    for (const code of ["PGRST202", "PGRST205", "42883", "42P01"]) expect(isMissingBudgetBackend({ code })).toBe(true);
  });

  it("reports everything else as a real sync failure", () => {
    for (const code of ["42501", "PGRST301", "22023", "28000", "08006", ""]) expect(isMissingBudgetBackend({ code })).toBe(false);
    expect(isMissingBudgetBackend(null)).toBe(false);
  });
});
