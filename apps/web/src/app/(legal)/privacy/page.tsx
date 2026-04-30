import type { Metadata } from "next";
import { APP_NAME } from "@template/shared";

export const metadata: Metadata = { title: "Privacy Policy" };

const EFFECTIVE_DATE = "April 30, 2026";

export default function PrivacyPage(): React.ReactElement {
  return (
    <article className="space-y-6 text-slate-700 leading-relaxed">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-slate-500">Effective {EFFECTIVE_DATE}</p>
      </header>

      <p>
        This Privacy Policy explains what information {APP_NAME} (&quot;we&quot;, &quot;our&quot;) collects,
        how we use it, and the choices you have. {APP_NAME} is currently in beta testing and
        intended for personal, non-commercial use.
      </p>

      <Section title="What we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Account information:</strong> email address and authentication tokens used to
            sign you in.
          </li>
          <li>
            <strong>Group and expense data:</strong> group names, member display names, expense
            descriptions, amounts, splits, payment records, and notes you enter.
          </li>
          <li>
            <strong>Receipt images and payment QR codes:</strong> if you upload them, they are
            stored in our cloud storage so the app can display them later.
          </li>
          <li>
            <strong>Diagnostic data:</strong> if enabled, we collect anonymized error reports and
            performance data to help us fix bugs. No expense content is included in these reports.
          </li>
        </ul>
      </Section>

      <Section title="How we use it">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>To provide the core expense-splitting features you actively use.</li>
          <li>
            To send a receipt image to a third-party AI provider for parsing, only when you
            explicitly tap &quot;scan receipt&quot;. Images are not retained by the AI provider beyond the
            request.
          </li>
          <li>To diagnose crashes and improve reliability.</li>
        </ul>
      </Section>

      <Section title="Sharing">
        <p>
          We do not sell or rent your data. We share data only with the service providers required
          to run the app (Supabase for database/auth/storage, OpenAI for receipt parsing when you
          opt in). We do not use your data to train AI models.
        </p>
      </Section>

      <Section title="Friend balance links">
        <p>
          If you share a balance link with someone, anyone with that link can view the balances and
          payment-profile details associated with that link until the group is deleted. Treat
          balance links like a private URL.
        </p>
      </Section>

      <Section title="Your rights">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>You can export or correct your data by contacting us.</li>
          <li>
            You can delete your account from <em>Account → Delete account</em>. This permanently
            removes your auth user and the groups you own.
          </li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>
          Questions or requests:{" "}
          <a href="mailto:hello@settleup.app" className="text-brand-600 hover:text-brand-700">
            hello@settleup.app
          </a>
        </p>
      </Section>

      <p className="text-sm text-slate-500">
        This policy may change as the product evolves. We will update the effective date above when
        it does.
      </p>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
