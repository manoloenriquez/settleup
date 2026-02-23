import Link from "next/link";
import { APP_NAME, ROUTES } from "@template/shared";

const features = [
  {
    title: "Auth out of the box",
    description: "Email/password authentication powered by Supabase — no config required.",
  },
  {
    title: "Type-safe end to end",
    description: "Database types flow from Supabase through shared packages to your UI.",
  },
  {
    title: "Admin dashboard",
    description: "Manage users and waitlist entries with role-based access control.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-slate-100">
        <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <span className="text-lg font-bold text-slate-900">{APP_NAME}</span>
          <div className="flex items-center gap-4">
            <Link
              href={ROUTES.LOGIN}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href={ROUTES.WAITLIST}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Join waitlist
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 py-28 text-center">
        <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 mb-6">
          Now in early access
        </span>
        <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
          Ship your SaaS
          <br />
          <span className="text-indigo-600">faster than ever</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-slate-600">
          A production-ready monorepo starter with auth, database, shared types, and an admin panel
          — all wired up and ready to go.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={ROUTES.WAITLIST}
            className="w-full sm:w-auto rounded-lg bg-indigo-600 px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
          >
            Join the waitlist
          </Link>
          <Link
            href={ROUTES.LOGIN}
            className="w-full sm:w-auto rounded-lg border border-slate-300 px-8 py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-slate-500 mb-12">
            Everything you need to launch
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h3 className="font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold text-slate-900">Ready to build?</h2>
        <p className="mt-4 text-slate-600">Join the waitlist and be the first to get access.</p>
        <Link
          href={ROUTES.WAITLIST}
          className="mt-8 inline-block rounded-lg bg-indigo-600 px-8 py-3.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          Get early access
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-8">
        <p className="text-center text-sm text-slate-400">
          © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
