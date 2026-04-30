import Link from "next/link";
import { APP_NAME, ROUTES } from "@template/shared";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href={ROUTES.HOME} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <span className="text-sm font-bold text-white">S</span>
            </div>
            <span className="text-lg font-bold text-slate-900">{APP_NAME}</span>
          </Link>
          <Link
            href={ROUTES.LOGIN}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">{children}</main>

      <footer className="border-t border-slate-100 py-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 px-6 text-xs text-slate-400">
          <div className="flex gap-4">
            <Link href={ROUTES.PRIVACY} className="hover:text-slate-600">
              Privacy
            </Link>
            <Link href={ROUTES.TERMS} className="hover:text-slate-600">
              Terms
            </Link>
          </div>
          <p>
            &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
