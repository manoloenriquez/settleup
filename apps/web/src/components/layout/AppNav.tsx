"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, Users, Shield, LogOut } from "lucide-react";
import { APP_NAME, ROUTES } from "@template/shared";
import { signOut } from "@/app/actions/auth";

type NavProfile = {
  email: string;
  role: string;
  full_name: string | null;
};

type Props = {
  profile: NavProfile;
};

const navLinks = [
  { href: ROUTES.DASHBOARD, label: "Dashboard", icon: LayoutDashboard },
  { href: ROUTES.GROUPS, label: "Groups", icon: Users },
] as const;

export function AppNav({ profile }: Props): React.ReactElement {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === ROUTES.DASHBOARD) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <Link
          href={ROUTES.DASHBOARD}
          className="text-lg font-bold text-slate-900 hover:text-indigo-600 transition-colors"
        >
          {APP_NAME}
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                  active
                    ? "text-indigo-600 bg-indigo-50"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50",
                ].join(" ")}
              >
                <Icon size={16} />
                {link.label}
              </Link>
            );
          })}

          {profile.role === "admin" && (
            <Link
              href={ROUTES.ADMIN}
              className={[
                "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                isActive(ROUTES.ADMIN)
                  ? "text-indigo-600 bg-indigo-50"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50",
              ].join(" ")}
            >
              <Shield size={16} />
              Admin
            </Link>
          )}

          {/* Divider + user */}
          <div className="ml-2 pl-3 border-l border-slate-200 flex items-center gap-3">
            <span className="text-sm text-slate-500 max-w-[160px] truncate">
              {profile.full_name ?? profile.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                <LogOut size={14} />
                <span className="hidden lg:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white animate-slide-down">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={[
                    "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "text-indigo-600 bg-indigo-50"
                      : "text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                >
                  <Icon size={18} />
                  {link.label}
                </Link>
              );
            })}
            {profile.role === "admin" && (
              <Link
                href={ROUTES.ADMIN}
                onClick={() => setMobileOpen(false)}
                className={[
                  "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive(ROUTES.ADMIN)
                    ? "text-indigo-600 bg-indigo-50"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                <Shield size={18} />
                Admin
              </Link>
            )}
          </div>
          <div className="border-t border-slate-100 px-4 py-3">
            <p className="text-sm text-slate-500 truncate mb-2">
              {profile.full_name ?? profile.email}
            </p>
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
