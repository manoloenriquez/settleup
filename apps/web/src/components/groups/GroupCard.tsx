import Link from "next/link";
import type { Group } from "@template/supabase";

type Props = {
  group: Group;
};

export function GroupCard({ group }: Props): React.ReactElement {
  return (
    <Link
      href={`/groups/${group.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
    >
      <h2 className="text-lg font-semibold text-slate-900">{group.name}</h2>
      <p className="mt-1 text-xs text-slate-400">
        Created {new Date(group.created_at).toLocaleDateString("en-PH")}
      </p>
    </Link>
  );
}
