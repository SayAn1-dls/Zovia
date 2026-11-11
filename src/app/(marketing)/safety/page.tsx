import {
  Ban,
  Flag,
  Gavel,
  HandCoins,
  Home,
  MapPin,
  MessageSquareWarning,
  Scale,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MarketingHero } from "@/components/layout/page-header";
import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Safety guidelines",
  description:
    "Community rules, roommate safety, and how reporting and appeals work on ZUVIO.",
  alternates: { canonical: "/safety" },
};

const communityRules = [
  { icon: UserCheck, title: "Be who you say you are", body: "Real name, real photos, real listings. No duplicates and no profiles for someone else." },
  { icon: Users, title: "Be respectful", body: "No harassment, hate speech, threats or sexual content. Take no for an answer." },
  { icon: HandCoins, title: "No money before a visit", body: "Never ask for, or send, a deposit or token amount before seeing the place in person." },
  { icon: Ban, title: "No spam or brokerage", body: "No advertising, mass messages or broker solicitation in chats, listings or reviews." },
] as const;

const roommateTips = [
  { icon: MessageSquareWarning, title: "Keep chat in ZUVIO at first", body: "Contact details are held back in roommate chat on purpose. Swap numbers in person, once you are comfortable." },
  { icon: MapPin, title: "Meet somewhere public", body: "Choose a cafe or another busy place for the first meeting, and tell a friend where you are going." },
  { icon: Home, title: "See the place together", body: "Visit in daylight, meet the owner or the current flatmates, and check the room that is actually on offer." },
  { icon: Scale, title: "Put it in writing", body: "Agree rent share, deposit, notice period and house rules in writing before anyone pays or moves in." },
] as const;

const seekerTips = [
  "Look for the three verification badges and read what each one means. A listing shows only the ones it has earned.",
  "Check the full monthly cost: rent plus maintenance, electricity, water, food and other mandatory charges.",
  "Bed availability is shown separately from the property's own availability. Confirm the exact bed or room with the owner.",
  "Pay only after a visit, to the owner or operator named on the agreement, and ask for a receipt.",
] as const;

const reportSteps = [
  { title: "Report", body: "Use Report on any profile, listing, review or message. Pick a reason and add details. Reporting a message keeps a snapshot of it for review." },
  { title: "Review", body: "A moderator on our team looks at the report in context and decides what to do. The person you reported is not told who reported them." },
  { title: "Action", body: "Outcomes range from no action to a warning, removed content, a feature restriction or an account suspension. Suspensions are always decided by a person." },
] as const;

function IconCard({ icon: Icon, title, body }: { icon: typeof Flag; title: string; body: string }) {
  return (
    <div className="flex h-full gap-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border sm:p-6">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-violet-strong">
        <Icon className="size-5" aria-hidden />
      </span>
      <div>
        <h3 className="font-sans text-base font-semibold">{title}</h3>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

export default function SafetyPage() {
  return (
    <>
      <MarketingHero
        eyebrow="Safety"
        title="Look out for yourself, and each other."
        description="The rules everyone on ZUVIO agrees to, practical advice for meeting roommates and visiting homes, and what happens when you report something."
      />

      <Section id="community" eyebrow="Community guidelines" title="Four rules for everyone">
        <ul className="grid gap-4 sm:grid-cols-2">
          {communityRules.map((rule, index) => (
            <Reveal as="li" key={rule.title} delay={index * 0.05}>
              <IconCard {...rule} />
            </Reveal>
          ))}
        </ul>
      </Section>

      <Section
        id="roommates"
        tone="tint"
        eyebrow="Roommate safety"
        title="Meeting someone new"
        description="A compatibility score is a starting point. Take your time before you share a home."
      >
        <ul className="grid gap-4 sm:grid-cols-2">
          {roommateTips.map((tip, index) => (
            <Reveal as="li" key={tip.title} delay={index * 0.05}>
              <IconCard {...tip} />
            </Reveal>
          ))}
        </ul>
        <div className="mt-6 flex gap-3 rounded-2xl border border-blue/25 bg-info-surface p-5 text-[0.9375rem] leading-relaxed text-info-foreground">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            <strong className="font-semibold">Why your message may not send.</strong> In roommate
            chat, messages containing phone numbers, e-mail addresses or social handles are not
            delivered and you will see a warning. Repeated attempts within 30 days can lead to a
            temporary messaging restriction, which you can appeal. Chats with property owners
            about an enquiry are not affected.
          </p>
        </div>
      </Section>

      <Section id="homes" eyebrow="Visiting homes" title="Before you commit to a place" size="narrow">
        <ul className="space-y-3">
          {seekerTips.map((tip, index) => (
            <li key={tip} className="flex gap-4 rounded-2xl bg-card p-5 shadow-xs ring-1 ring-border">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink font-heading text-sm font-bold text-white"
              >
                {index + 1}
              </span>
              <p className="text-[0.9375rem] leading-relaxed text-foreground/85">{tip}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="reporting"
        tone="dark"
        eyebrow="Reporting"
        title="What happens when you report"
        description="You can also block anyone at any time. Blocking is immediate and the other person is not notified."
      >
        <ol className="grid gap-4 md:grid-cols-3">
          {reportSteps.map((step, index) => (
            <li key={step.title} className="rounded-2xl bg-card p-6 ring-1 ring-border">
              <span aria-hidden className="font-heading text-sm font-bold text-violet-soft">
                Step {index + 1}
              </span>
              <h3 className="mt-2 text-xl font-bold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="appeals" eyebrow="Appeals" title="If we got it wrong" size="narrow">
        <div className="flex gap-4 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-violet-strong">
            <Gavel className="size-5" aria-hidden />
          </span>
          <div className="space-y-3 text-[0.9375rem] leading-relaxed text-foreground/85">
            <p>
              If your account is restricted or suspended, you are shown the reason and can appeal
              from your account. A suspended account can still sign in to read the reason and
              submit an appeal.
            </p>
            <p>
              You can appeal each decision once, in your own words. A member of our team reviews
              the appeal and replies with a decision and a short explanation. If the appeal is
              upheld, the restriction is lifted.
            </p>
            <p className="font-medium text-foreground">
              In an emergency, or if you are in danger, call 112 first. Then tell us.
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={routes.contact} className={buttonVariants({ size: "lg" })}>
            Contact us
          </Link>
          <Link href={routes.terms} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Read the terms
          </Link>
        </div>
      </Section>
    </>
  );
}
