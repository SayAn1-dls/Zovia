import type { Metadata } from "next";
import Link from "next/link";

import { MarketingHero } from "@/components/layout/page-header";
import { Container } from "@/components/layout/section";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "You're offline",
  robots: { index: false },
};

/** Shown by the service worker when a page cannot be loaded and nothing saved is available. */
export default function OfflinePage() {
  return (
    <>
      <MarketingHero
        title={
          <>
            You&apos;re <span className="mark-lime">offline.</span>
          </>
        }
        description="Check your connection and try again. Pages you opened recently still work."
      />
      <Container className="py-10 sm:py-14">
        <div className="flex flex-wrap gap-3">
          <Link href={routes.home} className={buttonVariants({ size: "xl" })}>
            Go home
          </Link>
          <Link href={routes.cities} className={buttonVariants({ variant: "outline", size: "xl" })}>
            Browse cities
          </Link>
        </div>
      </Container>
    </>
  );
}
