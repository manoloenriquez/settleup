import Link from "next/link";
import { APP_NAME, ROUTES } from "@template/shared";
import { Scissors, BarChart3, Link as LinkIcon, UserPlus, Receipt, PiggyBank } from "lucide-react";

const features = [
  {
    title: "Group expense splitting",
    description:
      "Add expenses to a group and split them equally or by custom shares — no spreadsheets required.",
    icon: Scissors,
  },
  {
    title: "Real-time balances",
    description:
      "See exactly who owes what at a glance. Balances update instantly as expenses and payments are recorded.",
    icon: BarChart3,
  },
  {
    title: "Shareable links",
    description:
      "Generate a private link to share your balance summary with friends — no account needed on their end.",
    icon: LinkIcon,
  },
];

const steps = [
  {
    step: "1",
    title: "Create a group",
    description: "Add a group and invite your friends by name.",
    icon: UserPlus,
  },
  {
    step: "2",
    title: "Add expenses",
    description: "Log what was spent and who paid. Split equally or custom.",
    icon: Receipt,
  },
  {
    step: "3",
    title: "Settle up",
    description: "See simplified debts and record payments when settled.",
    icon: PiggyBank,
  },
];

export default function LandingPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/80">
        <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">S</span>
            </div>
            <span className="text-lg font-bold text-slate-900">{APP_NAME}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href={ROUTES.LOGIN}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href={ROUTES.REGISTER}
              className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors shadow-sm"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-purple-50" />
        <div className="relative mx-auto max-w-3xl px-6 py-28 text-center animate-fade-in">
          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Split expenses.
            <br />
            <span className="text-brand-600">Track balances. Settle up.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-slate-600">
            The easiest way to split group expenses with friends, track who owes what, and settle up
            without the awkward math.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={ROUTES.REGISTER}
              className="w-full sm:w-auto rounded-xl bg-brand-600 px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 hover:shadow-md transition-all"
            >
              Create a free account
            </Link>
            <Link
              href={ROUTES.LOGIN}
              className="w-full sm:w-auto rounded-xl border border-slate-300 px-8 py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:shadow-sm transition-all"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-slate-500 mb-12">
            Everything you need to split fairly
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-brand-200 transition-all"
                >
                  <div className="mb-3 inline-flex rounded-xl bg-brand-50 p-2.5">
                    <Icon size={20} className="text-brand-600" />
                  </div>
                  <h3 className="font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-slate-100">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-slate-500 mb-12">
            How it works
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {steps.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.step} className="text-center">
                  <div className="relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 border-2 border-brand-200">
                    <Icon size={22} className="text-brand-600" />
                    <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-bold">
                      {s.step}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{s.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-slate-50 border-t border-slate-100">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-3xl font-bold text-slate-900">Ready to settle up?</h2>
          <p className="mt-4 text-slate-600">
            Create a free account and start splitting expenses with your group in minutes.
          </p>
          <Link
            href={ROUTES.REGISTER}
            className="mt-8 inline-block rounded-xl bg-brand-600 px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 hover:shadow-md transition-all"
          >
            Create a free account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-8">
        <div className="flex items-center justify-center gap-2">
          <div className="w-5 h-5 rounded bg-brand-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">S</span>
          </div>
          <p className="text-sm text-slate-400">
            &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
