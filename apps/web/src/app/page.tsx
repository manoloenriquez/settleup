import Link from "next/link";
import { APP_NAME, ROUTES } from "@template/shared";
import { Scan, Zap, Link2, Shield, Users, ArrowRight } from "lucide-react";

export default function LandingPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="absolute top-0 left-0 right-0 z-30">
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
              className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section
        className="relative min-h-[100dvh] flex items-center justify-center"
        style={{ background: "radial-gradient(ellipse at 50% 0%, #eef2ff 0%, white 70%)" }}
      >
        <div className="max-w-2xl px-6 text-center animate-fade-in">
          <p className="text-sm font-medium text-brand-600 tracking-wide uppercase mb-4">
            Group expense splitting
          </p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold text-slate-900 leading-[1.1] tracking-tighter">
            Split it fair.
            <br />
            Settle it simple.
          </h1>
          <p className="mt-6 text-lg text-slate-500 max-w-md mx-auto leading-relaxed">
            Track balances and settle debts with your group. No spreadsheets, no awkward math.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={ROUTES.REGISTER}
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-8 py-3.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Get started &mdash; it&apos;s free
              <ArrowRight size={14} />
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Already have an account?{" "}
            <Link
              href={ROUTES.LOGIN}
              className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-300">
          <span className="text-xs tracking-wider uppercase">Learn more</span>
          <div className="w-px h-6 bg-slate-200" />
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-slate-100">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <p className="text-sm font-medium text-brand-600 tracking-wide uppercase text-center mb-2">
            How it works
          </p>
          <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 tracking-tight text-center">
            Three steps to fair splits
          </h2>
          <div className="mt-16 flex flex-col gap-0">
            {[
              {
                num: "01",
                title: "Create a group & add members",
                desc: "Start a group for any occasion — a trip, dinner, rent, or anything shared. Add friends by name, no sign-up required for them.",
              },
              {
                num: "02",
                title: "Log expenses as they happen",
                desc: "Add what was spent and who paid. Split equally, by custom amounts, or let AI parse a receipt and suggest the split for you.",
              },
              {
                num: "03",
                title: "Settle up with a tap",
                desc: "See simplified debts at a glance. Record payments, share a balance link with friends, and close the loop.",
              },
            ].map((step) => (
              <div
                key={step.num}
                className="group flex items-start gap-6 border-t border-slate-100 first:border-t-0 py-8"
              >
                <span className="text-sm font-semibold text-brand-400 tabular-nums pt-0.5 shrink-0">
                  {step.num}
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-500 leading-relaxed max-w-lg">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-slate-50/50 border-t border-slate-100">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <p className="text-sm font-medium text-brand-600 tracking-wide uppercase text-center mb-2">
            Features
          </p>
          <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 tracking-tight text-center">
            Everything you need, nothing you don&apos;t
          </h2>
          <div className="mt-16 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Scan,
                title: "AI receipt scanning",
                desc: "Snap a photo of any receipt. AI extracts line items, amounts, and suggests how to split.",
              },
              {
                icon: Zap,
                title: "Smart splits",
                desc: "Describe an expense in plain language and let AI figure out who owes what.",
              },
              {
                icon: Users,
                title: "Multi-payer support",
                desc: "Handle expenses paid by multiple people. Custom shares, equal splits, or itemized — your call.",
              },
              {
                icon: Link2,
                title: "Shareable balance links",
                desc: "Send friends a private link to view what they owe. No account needed on their end.",
              },
              {
                icon: Shield,
                title: "Payment profiles",
                desc: "Save your GCash or bank details once. They show up automatically when friends view their balance.",
              },
              {
                icon: Zap,
                title: "Instant balances",
                desc: "Debts are simplified in real time. Always know exactly who owes whom and how much.",
              },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="flex items-start gap-4">
                  <div className="h-9 w-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon size={16} className="text-brand-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{f.title}</h3>
                    <p className="mt-1 text-sm text-slate-500 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-100">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 tracking-tight">
            Ready to settle up?
          </h2>
          <p className="mt-4 text-slate-500 max-w-md mx-auto">
            Create a free account and start splitting expenses with your group in minutes.
          </p>
          <Link
            href={ROUTES.REGISTER}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand-600 px-8 py-3.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Get started
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-10">
        <div className="mx-auto max-w-5xl px-6 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-brand-600 flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">S</span>
            </div>
            <span className="text-sm font-semibold text-slate-900">{APP_NAME}</span>
          </div>
          <p className="text-xs text-slate-400">
            &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
