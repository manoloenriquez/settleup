"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { GroupListItem } from "./GroupListItem";
import { Select } from "@/components/ui/Select";
import type { GroupWithStats } from "@template/shared";

type SortOption = "recent" | "name" | "members" | "owed";

const SORT_LABELS: Record<SortOption, string> = {
  recent: "Recent",
  name: "Name A–Z",
  members: "Most members",
  owed: "Most owed",
};

type Props = {
  groups: GroupWithStats[];
};

export function GroupList({ groups }: Props): React.ReactElement {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("recent");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = q
      ? groups.filter((g) => g.name.toLowerCase().includes(q))
      : [...groups];

    switch (sort) {
      case "name":
        result = result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "members":
        result = result.sort((a, b) => b.member_count - a.member_count);
        break;
      case "owed":
        result = result.sort((a, b) => b.total_owed_cents - a.total_owed_cents);
        break;
      default:
        // "recent" — already sorted by created_at desc from server
        break;
    }
    return result;
  }, [groups, search, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-300
                       placeholder:text-slate-400 focus:outline-none focus:ring-2
                       focus:ring-brand-500 focus:border-transparent bg-white"
          />
        </div>
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="w-auto"
        >
          {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
            <option key={key} value={key}>{SORT_LABELS[key]}</option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 && search && (
        <p className="text-sm text-slate-500 text-center py-6">
          No groups match &ldquo;{search}&rdquo;
        </p>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map((group) => (
            <GroupListItem key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
