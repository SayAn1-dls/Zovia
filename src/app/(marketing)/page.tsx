import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Container, Section } from "@/components/layout/section";
import { primaryActions, searchHref } from "@/lib/navigation";
import { citiesPhotos, spacesPhotos } from "@/lib/photos";
import { launchCities, site } from "@/lib/site";

import { HeroSearch } from "./_components/hero-search";

export const metadata: Metadata = {
  title: { absolute: `${site.name} — ${site.tagline}` },
  description: site.description,
  alternates: { canonical: "/" },
};

const steps = [
  { title: "Pick a city", body: "Tell us where, and how much." },
  { title: "See what's real", body: "Rent, deposit and extras, up front." },
  { title: "Say hi", body: "Message owners and matched roommates." },
] as const;

/** Room types shown with real photos. Each opens search filtered to that type. */
const spaces = [
  { label: "PGs", type: "pg", photo: spacesPhotos.pg },
  { label: "Hostels", type: "hostel", photo: spacesPhotos.hostel },
  { label: "Co-living", type: "co_living", photo: spacesPhotos.coliving },
  { label: "Flats", type: "one_bhk", photo: spacesPhotos.flat },
] as const;

const photoCities = launchCities.filter((city) => city.slug in citiesPhotos);
const otherCities = launchCities.filter((city) => !(city.slug in citiesPhotos));

export default function HomePage() {
  return (
    <>
      <Container className="pt-10 pb-14 sm:pt-20 sm:pb-24">
        <h1 className="text-display-xl font-extrabold">
          Find your <br className="sm:hidden" />
          space.
          <br />
          Find your <br className="sm:hidden" />
          <span className="mark-lime">people.</span>
        </h1>
        <p className="mt-5 max-w-lg text-lead text-muted-foreground sm:mt-7">
          New city. New room. New people. Let&apos;s sort it.
        </p>

        <div className="mt-7 max-w-2xl sm:mt-10">
          <HeroSearch />
        </div>

        <ul className="mt-3 grid max-w-2xl grid-cols-3 gap-2 sm:gap-3">
          {primaryActions.map((action) => (
            <li key={action.href}>
              <Link
                href={action.href}
                className="group flex h-full min-h-20 flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-3 transition-colors duration-150 hover:border-foreground sm:flex-row sm:items-center sm:p-4"
              >
                <action.icon className="size-5 shrink-0" aria-hidden />
                <span className="text-[0.8125rem] leading-tight font-semibold sm:flex-1 sm:text-[0.9375rem]">
                  {action.label}
                </span>
                <ArrowUpRight
                  className="hidden size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-foreground sm:block"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </Container>

      <Section id="how-it-works" title="How it works" divider className="pt-0 sm:pt-0">
        <ol className="grid gap-8 sm:grid-cols-3 sm:gap-10">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span aria-hidden className="font-heading text-sm font-bold text-muted-foreground tabular-nums">
                0{index + 1}
              </span>
              <h3 className="mt-1 text-display-sm font-extrabold">{step.title}</h3>
              <p className="mt-1 text-base text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="spaces" title="Pick your kind of space" divider className="pt-0 sm:pt-0">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {spaces.map((space) => (
            <li key={space.type}>
              <Link href={searchHref({ type: space.type })} className="group block">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                  <Image
                    src={space.photo.src}
                    alt={space.photo.alt}
                    fill
                    sizes="(min-width: 640px) 25vw, 50vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
                  />
                </div>
                <span className="mt-2 flex items-center gap-1 text-[0.9375rem] font-semibold">
                  {space.label}
                  <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Example photos of each kind of space. Listings show the owner&apos;s own photos.</p>
      </Section>

      <Section id="cities" title="Start with your city" divider className="pt-0 sm:pt-0">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {photoCities.map((city) => {
            const photo = citiesPhotos[city.slug as keyof typeof citiesPhotos];
            return (
              <li key={city.slug}>
                <Link
                  href={searchHref({ city: city.slug })}
                  className="group relative block aspect-[4/3] overflow-hidden rounded-2xl bg-ink"
                >
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="(min-width: 640px) 25vw, 50vw"
                    className="object-cover opacity-90 transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
                  />
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <span className="absolute bottom-3 left-3 text-base font-bold text-white">{city.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <ul className="mt-4 flex flex-wrap gap-2">
          {otherCities.map((city) => (
            <li key={city.slug}>
              <Link
                href={searchHref({ city: city.slug })}
                className="inline-flex h-11 items-center rounded-full border border-border bg-card px-4 text-[0.9375rem] font-medium transition-colors duration-150 hover:border-foreground hover:bg-lime"
              >
                {city.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
