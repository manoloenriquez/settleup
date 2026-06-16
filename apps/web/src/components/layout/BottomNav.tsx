"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Plus, User, Users } from "lucide-react";
import { ROUTES } from "@template/shared";

const tabs = [
  { href: ROUTES.DASHBOARD, label: "Home", icon: LayoutDashboard },
  { href: ROUTES.GROUPS, label: "Groups", icon: Users },
  { href: ROUTES.ACCOUNT, label: "Account", icon: User },
] as const;

/**
 * Native-style bottom tab bar shown on mobile only (`md:hidden`).
 * Mirrors AppNav's active-route logic; the desktop top nav stays unchanged.
 */
export function BottomNav(): React.ReactElement {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === ROUTES.DASHBOARD) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200/80 bg-white/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
        <Tab {...tabs[0]} active={isActive(tabs[0].href)} />
        <Tab {...tabs[1]} active={isActive(tabs[1].href)} />

        {/* Center "New group" action */}
        <Link
          href={ROUTES.GROUP_NEW}
          aria-label="New group"
          className="flex flex-1 flex-col items-center justify-center py-1.5"
        >
          <span className="flex h-11 w-11 -translate-y-3 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-colors hover:bg-brand-700">
            <Plus size={22} />
          </span>
          <span className="-mt-2 text-[10px] font-medium text-slate-500">New</span>
        </Link>

        <Tab {...tabs[2]} active={isActive(tabs[2].href)} />
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
  icon: typeof LayoutDashboard;
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
