import { ArrowRight, Ban, Eye, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MarketingHero } from "@/components/layout/page-header";
import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { primaryActions, routes } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "About",
  description:
    "ZUVIO is one place to find a home, find a roommate, or list a property in India.",
  alternates: { canonical: "/about" },
};

const principles = [
  {
    icon: Ban,
    title: "Nothing made up",
    body: "Listings come from owners and go through review before they are published. We never pad search with invented homes, prices or availability.",
  },
  {
    icon: Eye,
    title: "Clear, not clever",
    body: "Rent, deposit and monthly extras are broken out. Bed counts are shown as they are. Each verification badge says exactly what was checked.",
  },
  {
    icon: Sparkles,
    title: "People first",
    body: "Roommate matching starts from how you live: sleep, food, cleanliness, guests, budget. You talk only when the interest is mutual.",
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <MarketingHero
        eyebrow="About ZUVIO"
        title="Moving to a new city is hard enough."
        description="ZUVIO puts the two halves of the search in one place: somewhere to live, and someone good to live with."
      />

      <Section size="narrow" compact>
        <div className="space-y-5 text-lead text-foreground/85">
          <p>
            Students and working professionals in India usually juggle listing sites, chat groups
            and brokers to find a room, then hope the person in the next bed is easy to live with.
          </p>
          <p>
            ZUVIO is built for that search. Find PGs, hostels, co-living spaces, rooms and flats.
            Find roommates by budget, location and lifestyle. If you own or run a property, list
            it and manage vacancies from one place.
          </p>
        </div>
      </Section>

      <Section tone="tint" eyebrow="What we stand for" title="Three promises we build around">
        <ul className="grid gap-5 md:grid-cols-3">
          {principles.map((item, index) => (
            <Reveal as="li" key={item.title} delay={index * 0.08}>
              <div className="h-full rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border sm:p-7">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-violet-strong">
                  <item.icon className="size-6" aria-hidden />
                </span>
                <h3 className="mt-5 text-xl font-bold tracking-tight">{item.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Get started" title="Where would you like to begin?">
        <ul className="grid gap-4 md:grid-cols-3">
          {primaryActions.map((action) => (
            <li key={action.href}>
              <Link
                href={action.href}
                className="group flex h-full flex-col rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border transition-[box-shadow,transform] duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-lg hover:ring-violet/30"
              >
                <span className="bg-gradient-brand flex size-12 items-center justify-center rounded-2xl text-white">
                  <action.icon className="size-6" aria-hidden />
                </span>
                <span className="mt-5 font-heading text-xl font-bold tracking-tight">{action.label}</span>
                <span className="mt-1 text-[0.9375rem] text-muted-foreground">{action.description}</span>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-strong">
                  Go
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-[0.9375rem] text-muted-foreground">
          Questions or feedback?{" "}
          <Link href={routes.contact} className="font-semibold text-violet-strong underline underline-offset-4">
            Get in touch
          </Link>
          .
        </p>
      </Section>
    </>
  );
}
