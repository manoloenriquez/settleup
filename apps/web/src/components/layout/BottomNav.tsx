"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Plus, User, Users, Activity } from "lucide-react";
import { ROUTES } from "@template/shared";

const tabs = [
  { href: ROUTES.DASHBOARD, label: "Home", icon: Home },
  { href: ROUTES.GROUPS, label: "Groups", icon: Users },
  { href: ROUTES.ACTIVITY, label: "Activity", icon: Activity },
  { href: ROUTES.ACCOUNT, label: "Profile", icon: User },
] as const;

/**
 * Native-style bottom tab bar shown on mobile only (`md:hidden`).
 * Five slots per the mockup: Home, Groups, center add-expense FAB,
 * Activity, Profile. Mirrors AppNav's active-route logic.
 */
export function BottomNav(): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(href: string): boolean {
    if (href === ROUTES.DASHBOARD) return pathname === href;
    return pathname.startsWith(href);
  }

  // Context-aware center FAB: on a group page it deep-links straight into
  // that group's Add Expense dialog; elsewhere it goes to the groups list.
  function handleAdd(): void {
    const groupMatch = pathname.match(/^\/groups\/([0-9a-f-]{36})/);
    if (groupMatch) {
      router.push(`/groups/${groupMatch[1]}?add=expense`);
    } else {
      router.push(ROUTES.GROUPS);
    }
  }

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200/80 bg-white/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
        <Tab {...tabs[0]} active={isActive(tabs[0].href)} />
        <Tab {...tabs[1]} active={isActive(tabs[1].href)} />

        {/* Center add-expense FAB */}
        <button
          type="button"
          onClick={handleAdd}
          aria-label="Add expense"
          className="flex flex-1 flex-col items-center justify-center py-1.5"
        >
          <span className="flex h-12 w-12 -translate-y-4 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/40 ring-4 ring-slate-50 transition-colors hover:bg-brand-700 active:scale-95">
            <Plus size={24} />
          </span>
        </button>

        <Tab {...tabs[2]} active={isActive(tabs[2].href)} />
        <Tab {...tabs[3]} active={isActive(tabs[3].href)} />
      </div>
    </nav>
  );
}

function Tab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}): React.ReactElement {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
        active ? "text-brand-700" : "text-slate-400 hover:text-slate-700",
      ].join(" ")}
    >
      <Icon size={22} strokeWidth={active ? 2.4 : 2} />
      {label}
    </Link>
  );
}
