import type { ReactNode } from "react";

/** Heading + body + footer used by every auth page. Renders the page's single <h1>. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="w-full max-w-md">
      <h1 className="text-display-sm font-extrabold text-foreground">{title}</h1>
      {description ? <p className="mt-2 text-[0.9375rem] text-muted-foreground">{description}</p> : null}
      <div className="mt-8">{children}</div>
      {footer ? <div className="mt-8 text-sm text-muted-foreground">{footer}</div> : null}
    </div>
  );
}

export const authLinkClass =
  "font-semibold text-foreground underline decoration-foreground/40 underline-offset-4 hover:decoration-foreground";
