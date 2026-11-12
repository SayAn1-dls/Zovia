import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MarketingHero } from "@/components/layout/page-header";
import { Container } from "@/components/layout/section";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/navigation";
import { allPhotos } from "@/lib/photos";

export const metadata: Metadata = {
  title: "About",
  description:
    "ZUVIO is one place to find a home, find a roommate, or list a property in India.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <MarketingHero
        title={
          <>
            New city. <br />
            New room. <br />
            <span className="mark-lime">Let&apos;s sort it.</span>
          </>
        }
      />
      <Container className="py-12 sm:py-16">
        <div className="max-w-md space-y-3 text-lead">
          <p>Moving is hard enough.</p>
          <p>So ZUVIO keeps homes and roommates in one place.</p>
          <p>Owners list. We review. You choose.</p>
          <p>Nothing made up. No brokers in your inbox.</p>
        </div>
        <Link href={routes.search} className={`${buttonVariants({ size: "xl" })} mt-9`}>
          Find a home
          <ArrowRight aria-hidden />
        </Link>

        <section id="photo-credits" className="mt-16 max-w-2xl scroll-mt-24">
          <h2 className="text-lg font-bold">Photo credits</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Photos on our home page are real photographs from Wikimedia Commons, used under these licences.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
            {allPhotos.map((photo) => (
              <li key={photo.src}>
                <a href={photo.sourceUrl} className="underline underline-offset-4 hover:text-foreground">
                  {photo.alt}
                </a>{" "}
                by {photo.author},{" "}
                <a href={photo.licenseUrl} className="underline underline-offset-4 hover:text-foreground">
                  {photo.license}
                </a>
                {photo.license.includes("SA") || photo.license.startsWith("CC BY") ? " (resized and cropped)" : ""}
              </li>
            ))}
          </ul>
        </section>
      </Container>
    </>
  );
}
