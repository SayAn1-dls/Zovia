import {
  ArrowRight,
  BedDouble,
  CalendarCheck,
  ClipboardCheck,
  Inbox,
  LineChart,
  MessageSquareReply,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MarketingHero } from "@/components/layout/page-header";
import { Container, Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { buttonVariants } from "@/components/ui/button";
import { verificationSignals, type VerificationKind } from "@/components/verified-badge";
import { routes, withQuery } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "List your property",
  description:
    "List PGs, hostels, co-living spaces, rooms and flats on ZUVIO. Manage rooms, beds, availability and enquiries in one place.",
  alternates: { canonical: "/list-your-property" },
};

/** Owners sign up, then continue to the owner onboarding. */
const ownerSignUp = withQuery(routes.signUp, { next: routes.ownerOnboarding });

const benefits = [
  { icon: BedDouble, title: "Rooms and beds, not just a headline", body: "Model your property the way it runs: rooms, beds, per-bed rent and which beds are free." },
  { icon: CalendarCheck, title: "Availability that stays current", body: "Update a bed in a tap. We remind you to reconfirm, so seekers see listings they can trust." },
  { icon: Inbox, title: "One inbox for enquiries", body: "Every enquiry arrives as a conversation with the seeker's move-in date and message attached." },
  { icon: LineChart, title: "See how each listing performs", body: "Daily views, saves, enquiries and contact requests for every listing." },
  { icon: MessageSquareReply, title: "Reply to reviews", body: "Reviews come only from people who enquired about your property, and you can answer publicly." },
  { icon: ClipboardCheck, title: "Reviewed before it goes live", body: "Our team checks each listing before publishing, which keeps duplicates and fakes out of search." },
] as const;

const verificationSteps: ReadonlyArray<{ kind: VerificationKind; how: string }> = [
  { kind: "owner", how: "Upload an identity document. Our team reviews it and marks your owner profile as verified." },
  { kind: "authorisation", how: "Upload proof that you can let the property, such as ownership or authorisation papers. It is checked per property." },
  { kind: "recently_confirmed", how: "Confirm your listing is still accurate. The badge shows for 30 days after each confirmation." },
];

const steps = [
  { title: "Create your owner account", body: "Sign up, verify your e-mail and tell us whether you are an individual owner or an operator." },
  { title: "Add your property", body: "Describe the place, add rooms and beds, set pricing and upload photos." },
  { title: "Submit for review", body: "We check the listing. Once approved it is published and enquiries start arriving in your inbox." },
] as const;

export default function ListYourPropertyPage() {
  return (
    <>
      <MarketingHero
        eyebrow="For owners and PG operators"
        title="Fill your rooms with people who are actually looking."
        description="List PGs, hostels, co-living spaces, rooms and flats. Keep vacancies current and handle every enquiry in one place."
      >
        <div className="flex flex-wrap gap-3">
          <Link href={ownerSignUp} className={buttonVariants({ size: "xl" })}>
            Sign up as an owner
            <ArrowRight aria-hidden />
          </Link>
          <Link href={routes.signIn} className={buttonVariants({ variant: "outline", size: "xl" })}>
            I already have an account
          </Link>
        </div>
      </MarketingHero>

      <Section id="benefits" eyebrow="Why list on ZUVIO" title="Built for how PGs and rentals really run">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit, index) => (
            <Reveal as="li" key={benefit.title} delay={(index % 3) * 0.06}>
              <div className="h-full rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-violet-strong">
                  <benefit.icon className="size-6" aria-hidden />
                </span>
                <h3 className="mt-5 text-xl font-bold tracking-tight">{benefit.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{benefit.body}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </Section>

      <Section
        id="verification"
        tone="tint"
        eyebrow="How verification works"
        title="Three badges, earned separately"
        description="Seekers see exactly which checks a listing has passed. A verified phone number on its own never counts as proof of ownership."
      >
        <ol className="grid gap-5 md:grid-cols-3">
          {verificationSteps.map(({ kind, how }, index) => {
            const signal = verificationSignals[kind];
            return (
              <Reveal as="li" key={kind} delay={index * 0.08}>
                <div className="h-full rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border sm:p-7">
                  <span className={cn("flex size-12 items-center justify-center rounded-2xl", signal.iconWrap)}>
                    <signal.icon className="size-6" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-xl font-bold tracking-tight">{signal.label}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{how}</p>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </Section>

      <Section id="steps" eyebrow="Getting started" title="Live in three steps">
        <ol className="grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="relative rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border sm:p-7">
              <span
                aria-hidden
                className="bg-gradient-brand flex size-10 items-center justify-center rounded-full font-heading text-base font-bold text-white"
              >
                {index + 1}
              </span>
              <h3 className="mt-5 text-xl font-bold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <div className="pb-16 sm:pb-24">
        <Container>
          <div className="band-dark relative isolate overflow-hidden rounded-3xl px-6 py-10 sm:px-12 sm:py-14">
            <div aria-hidden className="absolute -top-32 -right-24 -z-10 size-96 rounded-full bg-violet/40 blur-[100px]" />
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-xl">
                <h2 className="text-display-md font-bold">Ready when you are.</h2>
                <p className="mt-3 text-lead text-muted-foreground">
                  ZUVIO does not take bookings or payments. You deal with your tenants directly.
                </p>
              </div>
              <Link href={ownerSignUp} className={cn(buttonVariants({ size: "xl" }), "shrink-0")}>
                Sign up as an owner
                <ArrowRight aria-hidden />
              </Link>
            </div>
          </div>
        </Container>
      </div>
    </>
  );
}
