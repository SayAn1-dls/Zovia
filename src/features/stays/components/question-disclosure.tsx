"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** The disclosure's id: `#ask` links open it and scroll to it. */
export const QUESTION_ID = "ask";

/** Opens the question disclosure (if it is on the page) before a `#ask` link scrolls to it. */
export function openQuestion() {
  const element = document.getElementById(QUESTION_ID);
  if (element instanceof HTMLDetailsElement) element.open = true;
}

/**
 * "Have a question?" folded into one row under the booking column, so the column is not a tall
 * stack of forms. A native <details>: the summary is a real button for keyboards and screen
 * readers (expanded / collapsed is announced), and the form inside stays mounted while closed,
 * so nothing typed is lost. Arriving with `#ask` in the address opens it.
 */
export function QuestionDisclosure({ hint, children }: { hint: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const sync = () => {
      if (window.location.hash === `#${QUESTION_ID}` && ref.current) ref.current.open = true;
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <details ref={ref} id={QUESTION_ID} data-testid="question-disclosure" className="group scroll-mt-32 rounded-3xl bg-card ring-1 ring-border">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-3xl px-6 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-7 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-semibold">Have a question?</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{hint}</span>
        </span>
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full ring-1 ring-border transition-colors group-hover:bg-muted">
          <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-6 px-6 pt-2 pb-6 sm:px-7 sm:pb-7">{children}</div>
    </details>
  );
}
