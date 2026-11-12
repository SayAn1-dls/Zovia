import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MarketingHero } from "@/components/layout/page-header";
import { Container } from "@/components/layout/section";
import { buttonVariants } from "@/components/ui/button";
import { routes, withQuery } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "List your property",
  description:
    "List PGs, hostels, co-living spaces, rooms and flats on ZUVIO. Manage rooms, beds, availability and enquiries in one place.",
  alternates: { canonical: "/list-your-property" },
};

/** Owners sign up, then continue to the owner onboarding. */
const ownerSignUp = withQuery(routes.signUp, { next: routes.ownerOnboarding });

const steps = [
  { title: "Sign up", body: "Create an owner account." },
  { title: "Add your place", body: "Rooms, beds, rent, photos." },
  { title: "Get verified", body: "We check your ID and your right to let." },
  { title: "Go live", body: "We review it. Enquiries land in your inbox." },
] as const;

export default function ListYourPropertyPage() {
  return (
    <>
      <MarketingHero
        title={
          <>
            Empty room? <br />
            <span className="mark-lime">Let&apos;s fill it.</span>
          </>
        }
        description="PGs, hostels, co-living, rooms and flats. One place for your beds and your enquiries."
      />
      <Container className="py-12 sm:py-16">
        <ol className="max-w-xl border-t border-foreground">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-5 border-b border-border py-5">
              <span aria-hidden className="w-7 shrink-0 pt-0.5 font-heading text-sm font-bold text-muted-foreground tabular-nums">
                0{index + 1}
              </span>
              <div>
                <h2 className="text-display-sm font-bold">{step.title}</h2>
                <p className="mt-1 text-base text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link href={ownerSignUp} className={`${buttonVariants({ size: "xl" })} mt-9`}>
          Sign up as an owner
          <ArrowRight aria-hidden />
        </Link>
      </Container>
    </>
  );
}
