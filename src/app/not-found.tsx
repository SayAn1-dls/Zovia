import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-dvh flex-1 flex-col outline-none">
      <div className="px-5 pt-3 sm:px-8">
        <Link href={routes.home} aria-label="Zovia home" className="inline-flex h-11 items-center rounded-lg">
          <Logo size="md" />
        </Link>
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-16 sm:px-8">
        <p className="text-sm font-semibold text-muted-foreground">Error 404</p>
        <h1 className="mt-3 text-display-xl font-extrabold">
          This address is <span className="mark-lime">vacant.</span>
        </h1>
        <p className="mt-5 max-w-md text-lead text-muted-foreground">
          The page has moved or never existed.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={routes.home} className={buttonVariants({ size: "xl" })}>
            Go home
          </Link>
          <Link href={routes.search} className={buttonVariants({ variant: "outline", size: "xl" })}>
            Find a home
          </Link>
        </div>
      </div>
    </main>
  );
}
