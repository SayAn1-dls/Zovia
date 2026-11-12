import type { ReactNode } from "react";

import { MarketingHero } from "@/components/layout/page-header";
import { Container } from "@/components/layout/section";

type LegalPageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  /** Human-readable date, e.g. "11 November 2026". */
  lastUpdated: string;
  /** Show the "needs legal review" note (true for Privacy and Terms). */
  draft?: boolean;
  /** In-page contents: [anchor id, label]. */
  contents: ReadonlyArray<readonly [id: string, label: string]>;
  children: ReactNode;
};

/** Layout for long-form policy pages: plain text in a readable column with a contents list. */
export function LegalPage({ eyebrow, title, summary, lastUpdated, draft = false, contents, children }: LegalPageProps) {
  return (
    <>
      <MarketingHero eyebrow={eyebrow} title={title} description={summary} size="narrow">
        <p className="text-sm text-muted-foreground">Last updated {lastUpdated}</p>
      </MarketingHero>
      <Container size="narrow" className="py-10 sm:py-14">
        {draft ? (
          <p
            role="note"
            className="mb-10 rounded-2xl border border-warning-foreground/30 bg-warning-surface p-4 text-sm text-warning-foreground"
          >
            <strong className="font-semibold">Draft, pending legal review.</strong> This page
            describes in plain English how ZUVIO works today. It has not yet been reviewed by a
            lawyer and will be finalised before launch.
          </p>
        ) : null}

        <nav aria-label="On this page" className="mb-12 border-y border-border py-4">
          <h2 className="font-sans text-sm font-semibold text-muted-foreground">On this page</h2>
          <ol className="mt-1 grid gap-x-6 sm:grid-cols-2">
            {contents.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground sm:min-h-9"
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
