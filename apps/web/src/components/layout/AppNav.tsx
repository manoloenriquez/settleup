"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Shield, LogOut, ChevronDown, User, Plus, WalletCards } from "lucide-react";
import { ROUTES } from "@template/shared";
import { signOut } from "@/app/actions/auth";
import { BrandLockup } from "@/components/brand/BrandLockup";

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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === ROUTES.DASHBOARD) return pathname === href;
    return pathname.startsWith(href);
  }

  const initials = getInitials(profile.full_name, profile.email);
  const displayName = profile.full_name ?? profile.email;

  useEffect(() => {
    if (!userMenuOpen) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
        userMenuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [userMenuOpen]);

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">

        {/* Brand */}
        <BrandLockup href={ROUTES.DASHBOARD} compact />

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
              ref={userMenuButtonRef}
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
              aria-controls="account-menu"
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
                <div id="account-menu" role="menu" className="absolute right-0 top-full mt-2 w-56 rounded-card border border-border-subtle bg-surface py-1 shadow-floating z-20 animate-scale-in">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-xs font-medium text-slate-900 truncate">{displayName}</p>
                    <p className="text-xs text-slate-400 truncate">{profile.email}</p>
                  </div>
                  <Link role="menuitem"
                    href="/account"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <User size={14} />
                    Account
                  </Link>
                  <form action={signOut}>
                    <button role="menuitem"
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

        <Link href="/account" className="md:hidden" aria-label="Account">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{initials}</div>
        </Link>
      </nav>
    </header>
  );
}

export function MobileBottomNav(): React.ReactElement {
  const pathname = usePathname();
  const items = [
    { href: ROUTES.DASHBOARD, label: "Home", icon: LayoutDashboard, elevated: false },
    { href: ROUTES.GROUPS, label: "Groups", icon: Users, elevated: false },
    { href: ROUTES.EXPENSE_NEW, label: "Add", icon: Plus, elevated: true },
    { href: "/account", label: "Account", icon: WalletCards, elevated: false },
  ] as const;
  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-3 bottom-3 z-40 grid h-16 grid-cols-4 rounded-panel border border-border-subtle bg-surface/95 px-2 shadow-floating backdrop-blur-md md:hidden">
      {items.map(({ href, label, icon: Icon, elevated }) => {
        const active = pathname === href || (href !== ROUTES.DASHBOARD && pathname.startsWith(href));
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${active ? "text-brand-700" : "text-muted"}`}>
            <span className={elevated ? "absolute -top-5 flex h-12 w-12 items-center justify-center rounded-full border-4 border-canvas bg-brand-600 text-white shadow-floating" : ""}>
              <Icon size={elevated ? 22 : 20} aria-hidden="true" />
            </span>
            <span className={elevated ? "mt-7" : ""}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
