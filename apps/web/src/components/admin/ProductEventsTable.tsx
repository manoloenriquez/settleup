import type { ProductEventRow } from "@/app/actions/analytics";

/**
 * Read-only view of recent product events. Rows carry only the event name,
 * time, platform, allowlisted properties and whether a signed-in user was
 * attached; no names, amounts or tokens exist in this table by design.
 */
export function ProductEventsTable({ events }: { events: ProductEventRow[] }): React.ReactElement {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
        No product events recorded yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2">When</th>
            <th className="px-4 py-2">Event</th>
            <th className="px-4 py-2">Platform</th>
            <th className="px-4 py-2">Properties</th>
            <th className="px-4 py-2">User</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {events.map((event) => (
            <tr key={event.id}>
              <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                {new Date(event.occurred_at).toLocaleString("en-PH")}
              </td>
              <td className="px-4 py-2 font-mono text-slate-900">{event.event_name}</td>
              <td className="px-4 py-2 text-slate-600">{event.platform}</td>
              <td className="px-4 py-2 text-slate-600">
                {Object.entries(event.properties)
                  .map(([key, value]) => `${key}=${value}`)
                  .join(", ") || "—"}
              </td>
              <td className="px-4 py-2 text-slate-600">{event.has_user ? "signed in" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
