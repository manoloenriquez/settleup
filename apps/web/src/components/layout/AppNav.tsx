"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Shield, LogOut, ChevronDown, User, Activity } from "lucide-react";
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
  { href: ROUTES.ACTIVITY, label: "Activity", icon: Activity },
] as const;

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
      : (parts[0]?.[0] ?? "?").toUpperCase();
  }
  return email[0]?.toUpperCase() ?? "?";
}

export function AppNav({ profile }: Props): React.ReactElement {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === ROUTES.DASHBOARD) return pathname === href;
    return pathname.startsWith(href);
  }

  const initials = getInitials(profile.full_name, profile.email);
  const displayName = profile.full_name ?? profile.email;

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 pt-safe">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">

        {/* Brand */}
        <Link
          href={ROUTES.DASHBOARD}
          className="flex items-center gap-2 group"
        >
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-sm group-hover:bg-brand-700 transition-colors">
            <span className="text-white text-sm font-bold">S</span>
          </div>
          <span className="text-base font-bold text-slate-900 tracking-tight">{APP_NAME}</span>
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
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all",
                  active
                    ? "text-brand-700 bg-brand-50 shadow-sm"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100",
                ].join(" ")}
              >
                <Icon size={15} />
                {link.label}
              </Link>
            );
          })}

          {profile.role === "admin" && (
            <Link
              href={ROUTES.ADMIN}
              className={[
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all",
                isActive(ROUTES.ADMIN)
                  ? "text-brand-700 bg-brand-50 shadow-sm"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100",
              ].join(" ")}
            >
              <Shield size={15} />
              Admin
            </Link>
          )}
        </div>

        {/* User menu */}
        <div className="hidden md:flex items-center">
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center">
                <span className="text-white text-xs font-semibold">{initials}</span>
              </div>
              <span className="text-sm text-slate-700 max-w-[120px] truncate font-medium">{displayName}</span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg z-20 animate-scale-in">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-xs font-medium text-slate-900 truncate">{displayName}</p>
                    <p className="text-xs text-slate-400 truncate">{profile.email}</p>
                  </div>
                  <Link
                    href="/account"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <User size={14} />
                    Account
                  </Link>
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      <LogOut size={14} />
                      Sign out
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile: brand-only header; primary nav lives in the bottom tab bar */}
        <Link
          href={ROUTES.ACCOUNT}
          aria-label="Account"
          className="md:hidden w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center"
        >
          <span className="text-white text-xs font-semibold">{initials}</span>
        </Link>
      </nav>
    </header>
  );
}
