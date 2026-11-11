import {
  ArrowRight,
  ArrowUpRight,
  EyeOff,
  ListChecks,
  MessagesSquare,
  PhoneOff,
  SlidersHorizontal,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Container, Eyebrow, Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { buttonVariants } from "@/components/ui/button";
import { verificationSignals, type VerificationKind } from "@/components/verified-badge";
import { primaryActions, routes, searchHref } from "@/lib/navigation";
import { launchCities, site } from "@/lib/site";
import { cn } from "@/lib/utils";

import { HeroArt } from "./_components/hero-art";
import { HeroSearch } from "./_components/hero-search";

export const metadata: Metadata = {
  title: { absolute: `${site.name} — ${site.tagline}` },
  description: site.description,
  alternates: { canonical: "/" },
};

const steps = [
  {
    icon: SlidersHorizontal,
    title: "Say what you need",
    body: "Pick a city and a budget. For roommates, answer a few questions about how you live.",
  },
  {
    icon: ListChecks,
    title: "Compare what's real",
    body: "Every listing breaks down rent, deposit and monthly extras, and shows available beds separately.",
  },
  {
    icon: MessagesSquare,
    title: "Connect on your terms",
    body: "Message owners or matched roommates in the app. Meet when you're both ready.",
  },
] as const;

const signalOrder: VerificationKind[] = ["owner", "authorisation", "recently_confirmed"];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <div className="band-dark relative isolate overflow-hidden">
        <div aria-hidden className="bg-dot-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_75%)]" />
        <div aria-hidden className="absolute -top-48 -left-40 -z-10 size-[36rem] rounded-full bg-violet/30 blur-[120px]" />
        <div aria-hidden className="absolute right-[-12rem] bottom-[-14rem] -z-10 size-[34rem] rounded-full bg-blue/25 blur-[120px]" />

        <Container className="grid items-center gap-12 pt-10 pb-16 sm:pt-16 sm:pb-24 lg:grid-cols-[1.15fr_1fr] lg:gap-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[0.8125rem] font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-green" aria-hidden />
              Homes and roommates across India
            </p>
            <h1 className="mt-5 text-display-xl font-extrabold">
              Find your space. <span className="text-gradient">Find your people.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lead text-muted-foreground">
              PGs, hostels, co-living and flats, plus roommates who match how you
              actually live.
            </p>

            <div className="mt-8 max-w-xl">
              <HeroSearch />
            </div>

            <ul className="mt-6 grid max-w-xl gap-2 sm:grid-cols-3">
              {primaryActions.map((action) => (
                <li key={action.href}>
                  <Link
                    href={action.href}
                    className="group flex h-full min-h-14 items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white transition-[background-color,border-color,transform] duration-200 ease-out-soft hover:-translate-y-0.5 hover:border-violet-soft/60 hover:bg-white/10"
                  >
                    <action.icon className="size-5 shrink-0 text-violet-soft" aria-hidden />
                    <span className="flex-1">{action.label}</span>
                    <ArrowRight
                      className="size-4 shrink-0 text-white/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="hidden lg:block">
            <HeroArt />
          </div>
        </Container>
      </div>

      {/* How it works */}
      <Section
        id="how-it-works"
        eyebrow="How it works"
        title="Three steps. No runaround."
      >
        <ol className="grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <Reveal as="li" key={step.title} delay={index * 0.08}>
              <div className="h-full rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-violet-strong">
                    <step.icon className="size-6" aria-hidden />
                  </span>
                  <span aria-hidden className="font-heading text-4xl font-extrabold text-lavender">
                    {index + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-display-sm font-bold">{step.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </Reveal>
          ))}
        </ol>
      </Section>

      {/* Trust */}
      <Section
        id="trust"
        tone="tint"
        eyebrow="Trust, spelled out"
        title="Three checks. Never one vague tick."
        description="Each badge means one specific thing, and a listing only shows the ones it has earned."
      >
        <ul className="grid gap-5 md:grid-cols-3">
          {signalOrder.map((kind, index) => {
            const signal = verificationSignals[kind];
            return (
              <Reveal as="li" key={kind} delay={index * 0.08}>
                <div className="h-full rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border sm:p-7">
                  <span className={cn("flex size-12 items-center justify-center rounded-2xl", signal.iconWrap)}>
                    <signal.icon className="size-6" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-xl font-bold tracking-tight">{signal.label}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
                    {signal.description}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </ul>

        <ul className="mt-5 grid gap-5 md:grid-cols-2">
          <Reveal as="li">
            <div className="band-dark flex h-full gap-4 rounded-2xl p-6 sm:p-7">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-violet-soft">
                <EyeOff className="size-6" aria-hidden />
              </span>
              <div>
                <h3 className="text-xl font-bold tracking-tight">Privacy-first roommate chat</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
                  You chat only after you both like each other. Phone numbers,
                  e-mail addresses and social handles are held back in roommate
                  chat, so you share them in person, when you choose.
                </p>
              </div>
            </div>
          </Reveal>
          <Reveal as="li" delay={0.08}>
            <div className="band-dark flex h-full gap-4 rounded-2xl p-6 sm:p-7">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-green">
                <PhoneOff className="size-6" aria-hidden />
              </span>
              <div>
                <h3 className="text-xl font-bold tracking-tight">No brokerage spam</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
                  Your number is never shown on a listing or handed to brokers.
                  You decide which owners to contact, and enquiries stay in
                  your ZUVIO inbox.
                </p>
              </div>
            </div>
          </Reveal>
        </ul>

        <p className="mt-8">
          <Link
            href={routes.safety}
            className="inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem] font-semibold text-violet-strong underline-offset-4 hover:underline"
          >
            Read the safety guidelines
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </p>
      </Section>

      {/* Cities */}
      <Section
        id="cities"
        eyebrow="Cities"
        title="Start with your city"
        description="Jump straight into search. You can narrow by locality, budget and more once you're there."
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {launchCities.map((city) => (
            <li key={city.slug}>
              <Link
                href={searchHref({ city: city.slug })}
                className="group flex min-h-16 items-center justify-between gap-2 rounded-2xl bg-card px-4 py-3 shadow-xs ring-1 ring-border transition-[box-shadow,transform,background-color] duration-200 ease-out-soft hover:-translate-y-0.5 hover:bg-secondary hover:shadow-md hover:ring-violet/30"
              >
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold">{city.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{city.state}</span>
                </span>
                <ArrowUpRight
                  className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-violet-strong"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* Owner call to action */}
      <div className="pb-16 sm:pb-24">
        <Container>
          <Reveal>
            <div className="bg-gradient-brand relative isolate overflow-hidden rounded-3xl px-6 py-10 text-white sm:px-12 sm:py-14">
              <div aria-hidden className="bg-dot-grid absolute inset-0 -z-10 opacity-70" />
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="max-w-xl">
                  <Eyebrow className="text-white">For owners and PG operators</Eyebrow>
                  <h2 className="text-display-md font-bold">Have a place to fill?</h2>
                  <p className="mt-3 text-lead text-white">
                    List rooms and beds, keep availability current and answer
                    enquiries in one inbox.
                  </p>
                </div>
                <Link
                  href={routes.listYourProperty}
                  className={cn(buttonVariants({ variant: "inverse", size: "xl" }), "shrink-0")}
                >
                  List your property
                  <ArrowRight aria-hidden />
                </Link>
              </div>
            </div>
          </Reveal>
        </Container>
      </div>
    </>
  );
}
