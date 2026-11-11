import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { MarketingHero } from "@/components/layout/page-header";
import { Container } from "@/components/layout/section";

type LegalPageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  /** Human-readable date, e.g. "11 November 2026". */
  lastUpdated: string;
  /** Show the "needs legal review" banner (true for Privacy and Terms). */
  draft?: boolean;
  /** In-page contents: [anchor id, label]. */
  contents: ReadonlyArray<readonly [id: string, label: string]>;
  children: ReactNode;
};

/** Layout for long-form policy pages: navy hero, contents list, readable column. */
export function LegalPage({ eyebrow, title, summary, lastUpdated, draft = false, contents, children }: LegalPageProps) {
  return (
    <>
      <MarketingHero eyebrow={eyebrow} title={title} description={summary} size="narrow">
        <p className="text-sm text-muted-foreground">Last updated {lastUpdated}</p>
      </MarketingHero>
      <Container size="narrow" className="py-12 sm:py-16">
        {draft ? (
          <div
            role="note"
            className="mb-10 flex gap-3 rounded-2xl border border-warning/40 bg-warning-surface p-4 text-sm text-warning-foreground sm:p-5"
          >
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            <p>
              <strong className="font-semibold">Draft, pending legal review.</strong> This page
              describes in plain English how ZUVIO works today. It has not yet been
              reviewed by a lawyer and will be finalised before launch.
            </p>
          </div>
        ) : null}

        <nav aria-label="On this page" className="mb-12 rounded-2xl bg-card p-5 shadow-xs ring-1 ring-border sm:p-6">
          <h2 className="font-sans text-sm font-semibold text-foreground">On this page</h2>
          <ol className="mt-2 grid gap-x-6 sm:grid-cols-2">
            {contents.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-violet-strong underline-offset-4 hover:underline sm:min-h-9"
                >
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="prose-zuvio">{children}</article>
      </Container>
    </>
  );
}
