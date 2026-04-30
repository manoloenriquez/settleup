import type { Metadata } from "next";
import { APP_NAME } from "@template/shared";

export const metadata: Metadata = { title: "Terms of Service" };

const EFFECTIVE_DATE = "April 30, 2026";

export default function TermsPage(): React.ReactElement {
  return (
    <article className="space-y-6 text-slate-700 leading-relaxed">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Terms of Service</h1>
        <p className="text-sm text-slate-500">Effective {EFFECTIVE_DATE}</p>
      </header>

      <p>
        Welcome to {APP_NAME}. By using the app you agree to these terms. {APP_NAME} is currently a
        beta product, provided as-is and free of charge.
      </p>

      <Section title="Your account">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>You must be at least 13 years old to use {APP_NAME}.</li>
          <li>
            You are responsible for the activity on your account and for keeping your password
            confidential.
          </li>
        </ul>
      </Section>

      <Section title="Acceptable use">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Don&apos;t use the app to harass others, send spam, or attempt to break it.</li>
          <li>
            Don&apos;t upload illegal, infringing, or malicious content (including malware, abusive
            imagery, or material you don&apos;t have rights to).
          </li>
          <li>
            Don&apos;t attempt to access other users&apos; data, reverse-engineer the service, or
            interfere with normal operation.
          </li>
        </ul>
      </Section>

      <Section title="Your content">
        <p>
          You retain ownership of group names, expense descriptions, and other content you enter. By
          using the app you grant us a license to store and display that content as needed to
          operate the service for you and the people you share groups with.
        </p>
      </Section>

      <Section title="No warranty; financial accuracy">
        <p>
          {APP_NAME} is provided &quot;as is&quot;, with no warranties. Balances are calculated from
          the data you enter and are intended as a convenience, not a financial record. We are not
          liable for disputes between members of your group.
        </p>
      </Section>

      <Section title="Termination">
        <p>
          You can stop using the app and delete your account at any time from Account settings. We
          may suspend accounts that violate these terms or that we believe are being used to harm
          others.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms as the product changes. Material changes will be communicated in
          the app or via email.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions:{" "}
          <a href="mailto:hello@settleup.app" className="text-brand-600 hover:text-brand-700">
            hello@settleup.app
          </a>
        </p>
      </Section>
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
