"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, Users, Shield, LogOut, ChevronDown } from "lucide-react";
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === ROUTES.DASHBOARD) return pathname === href;
    return pathname.startsWith(href);
  }

  const initials = getInitials(profile.full_name, profile.email);
  const displayName = profile.full_name ?? profile.email;

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30">
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

      {/* Mobile menu */}
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
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active ? "text-brand-700 bg-brand-50" : "text-slate-700 hover:bg-slate-50",
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
                  "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive(ROUTES.ADMIN) ? "text-brand-700 bg-brand-50" : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                <Shield size={18} />
                Admin
              </Link>
            )}
          </div>
          <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center">
                <span className="text-white text-xs font-semibold">{initials}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800 truncate max-w-[160px]">{displayName}</p>
                <p className="text-xs text-slate-400 truncate max-w-[160px]">{profile.email}</p>
              </div>
            </div>
            <form action={signOut}>
              <button type="submit" className="text-slate-400 hover:text-slate-700 transition-colors">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
