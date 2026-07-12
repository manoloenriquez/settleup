import Link from "next/link";
import { ArrowDown, ArrowRight, Camera, Check, LockKeyhole, ReceiptText, Sparkles, Users } from "lucide-react";
import { APP_NAME, ROUTES } from "@template/shared";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { ButtonLink } from "@/components/ui/ButtonLink";

const proof = [
  { icon: Camera, eyebrow: "Capture", title: "From receipt to shared expense", description: "Scan a receipt or add an expense in a few taps. SettleUp keeps the details clear without turning dinner into data entry." },
  { icon: Sparkles, eyebrow: "Understand", title: "Know the fair split instantly", description: "See who paid, who owes, and the simplest way to settle—with amounts that stay easy to audit." },
  { icon: Check, eyebrow: "Settle", title: "Close the loop without awkwardness", description: "Share a private balance link and payment details. Friends can check what they owe without creating an account." },
] as const;

function ProductPreview(): React.ReactElement {
  return (
    <div className="relative mx-auto w-full max-w-md rounded-panel border border-border-subtle bg-surface p-5 shadow-floating sm:p-6">
      <div className="flex items-center justify-between border-b border-border-subtle pb-4">
        <div><p className="text-xs font-semibold text-muted">Palawan weekend</p><p className="mt-0.5 text-sm font-bold text-ink">4 friends · 8 expenses</p></div>
        <div className="flex -space-x-2">{["ME", "JL", "AN"].map((name) => <span key={name} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-brand-100 text-[9px] font-bold text-brand-700">{name}</span>)}</div>
      </div>
      <div className="py-6">
        <span className="rounded-full bg-positive-soft px-2.5 py-1 text-xs font-semibold text-positive">You&apos;re owed</span>
        <p className="mt-3 text-amount text-4xl font-extrabold text-ink">₱2,480.00</p>
        <p className="mt-1 text-sm text-muted">across two simple payments</p>
      </div>
      <div className="space-y-2">
        {[{ name: "Jamie pays you", value: "₱1,650" }, { name: "Anna pays you", value: "₱830" }].map((row) => (
          <div key={row.name} className="flex items-center justify-between rounded-control bg-surface-muted px-4 py-3 text-sm"><span className="font-medium text-ink">{row.name}</span><span className="text-amount font-bold text-positive">{row.value}</span></div>
        ))}
      </div>
      <div className="absolute -right-3 -top-3 flex h-10 w-10 rotate-6 items-center justify-center rounded-control bg-outgoing-soft text-outgoing shadow-card"><ReceiptText size={19} /></div>
    </div>
  );
}

export default function LandingPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="relative z-30 border-b border-border-subtle/70 bg-canvas/80 backdrop-blur-md">
        <nav className="mx-auto flex h-18 max-w-6xl items-center justify-between px-5 sm:px-6">
          <BrandLockup compact />
          <div className="flex items-center gap-2 sm:gap-3"><Link href={ROUTES.LOGIN} className="px-3 py-2 text-sm font-semibold text-muted transition-colors hover:text-ink">Sign in</Link><ButtonLink href={ROUTES.REGISTER} size="sm">Get started</ButtonLink></div>
        </nav>
      </header>

      <main>
        <section className="bg-hero-gradient">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
            <div className="max-w-xl animate-fade-in">
              <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700"><Users size={14} />Friendly expense splitting</p>
              <h1 className="mt-6 text-5xl font-extrabold leading-[1.02] tracking-[-0.055em] text-ink sm:text-6xl">Shared money,<br /><span className="text-brand-600">made clear.</span></h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">Track the group, understand the fair split, and settle without the awkward math. Everyone sees exactly what matters.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row"><ButtonLink href={ROUTES.REGISTER} size="lg" rightIcon={ArrowRight}>Start splitting free</ButtonLink><ButtonLink href="#how-it-works" size="lg" variant="secondary" rightIcon={ArrowDown}>See how it works</ButtonLink></div>
              <p className="mt-5 flex items-center gap-2 text-xs font-medium text-muted"><LockKeyhole size={14} className="text-positive" />Private links · no sign-up needed for friends</p>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section id="how-it-works" className="border-y border-border-subtle bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-24">
            <div className="max-w-xl"><p className="text-sm font-semibold text-brand-700">How it works</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">A calmer way to share costs</h2><p className="mt-3 text-muted">Designed around the moments that usually create confusion.</p></div>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">{proof.map(({ icon: Icon, eyebrow, title, description }, index) => <article key={title} className="rounded-card border border-border-subtle bg-canvas p-6"><div className="flex items-center justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-control bg-brand-100 text-brand-700"><Icon size={20} /></span><span className="text-sm font-bold text-brand-300">0{index + 1}</span></div><p className="mt-7 text-xs font-bold uppercase tracking-[.16em] text-brand-700">{eyebrow}</p><h3 className="mt-2 text-xl font-bold tracking-tight text-ink">{title}</h3><p className="mt-3 text-sm leading-relaxed text-muted">{description}</p></article>)}</div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 text-center sm:px-6 sm:py-24"><div className="rounded-panel bg-brand-900 px-6 py-14 text-white shadow-floating sm:px-12"><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Leave the awkward math to us.</h2><p className="mx-auto mt-4 max-w-md text-brand-200">Create a group and get to one clear answer in minutes.</p><ButtonLink href={ROUTES.REGISTER} size="lg" variant="secondary" className="mt-8">Get started free</ButtonLink></div></section>
      </main>

      <footer className="border-t border-border-subtle bg-surface"><div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-6 py-8 sm:flex-row"><BrandLockup compact /><div className="flex gap-5 text-sm text-muted"><Link href={ROUTES.PRIVACY} className="hover:text-ink">Privacy</Link><Link href={ROUTES.TERMS} className="hover:text-ink">Terms</Link></div><p className="text-xs text-muted">© {new Date().getFullYear()} {APP_NAME}</p></div></footer>
    </div>
  );
}
