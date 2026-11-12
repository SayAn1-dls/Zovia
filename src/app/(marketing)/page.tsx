import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { Container } from "@/components/layout/section";
import { primaryActions, routes, searchHref } from "@/lib/navigation";
import { citiesPhotos, spacesPhotos } from "@/lib/photos";
import { launchCities, site } from "@/lib/site";

import { HeroSearch } from "./_components/hero-search";

export const metadata: Metadata = {
  title: { absolute: `${site.name} — ${site.tagline}` },
  description: site.description,
  alternates: { canonical: "/" },
};

/** Room types shown with real photos. Each opens search filtered to that type. */
const spaces = [
  { label: "PGs", type: "pg", photo: spacesPhotos.pg },
  { label: "Hostels", type: "hostel", photo: spacesPhotos.hostel },
  { label: "Co-living", type: "co_living", photo: spacesPhotos.coliving },
  { label: "Flats", type: "one_bhk", photo: spacesPhotos.flat },
] as const;

const photoCities = launchCities.filter((city) => city.slug in citiesPhotos);
const otherCities = launchCities.filter((city) => !(city.slug in citiesPhotos));

function Row({ id, title, action, children }: { id: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="py-8 sm:py-12">
      <Container size="wide">
        <div className="mb-4 flex items-end justify-between gap-4 sm:mb-6">
          <h2 id={`${id}-heading`} className="text-display-sm font-extrabold sm:text-display-md">
            {title}
          </h2>
          {action}
        </div>
        {children}
      </Container>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Container size="wide" className="pt-3 sm:pt-6">
        <div className="relative isolate overflow-hidden rounded-3xl bg-ink">
          <Image
            src={spacesPhotos.coliving.src}
            alt=""
            fill
            preload
            sizes="(min-width: 1280px) 1216px, 100vw"
            className="-z-10 object-cover opacity-70"
          />
          <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/35 to-black/10" />
          <div className="flex min-h-[26rem] flex-col justify-end gap-6 p-5 sm:min-h-[32rem] sm:p-10 lg:p-14">
            <h1 className="max-w-2xl text-display-lg font-extrabold text-white">
              Find your space. <span className="text-lime">Find your people.</span>
            </h1>
            <div className="max-w-2xl">
              <HeroSearch />
            </div>
          </div>
        </div>

        <ul className="mt-4 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-4">
          {primaryActions.map((action) => (
            <li key={action.href}>
              <Link
                href={action.href}
                className="group flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-3 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:flex-row sm:items-center sm:gap-4 sm:p-5"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lime text-ink sm:size-12">
                  <action.icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.8125rem] leading-tight font-semibold sm:text-base">{action.label}</span>
                  <span className="mt-0.5 hidden text-sm text-muted-foreground sm:block">{action.description}</span>
                </span>
                <ArrowRight
                  className="hidden size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none sm:block"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </Container>

      <Row id="spaces" title="Kinds of space">
        <ul className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-5 sm:overflow-visible sm:px-0">
          {spaces.map((space) => (
            <li key={space.type} className="w-[62%] shrink-0 snap-start sm:w-auto">
              <Link href={searchHref({ type: space.type })} className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
                  <Image
                    src={space.photo.src}
                    alt={space.photo.alt}
                    fill
                    sizes="(min-width: 640px) 25vw, 62vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
                  />
                </div>
                <span className="mt-2 block text-base font-semibold">{space.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Example photos. Listings show the owner&apos;s own.</p>
      </Row>

      <Row
        id="cities"
        title="Popular cities"
        action={
          <Link href={routes.search} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline">
            All homes
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
          {photoCities.map((city) => {
            const photo = citiesPhotos[city.slug as keyof typeof citiesPhotos];
            return (
              <li key={city.slug}>
                <Link
                  href={searchHref({ city: city.slug })}
                  className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-ink outline-none focus-visible:ring-2 focus-visible:ring-ring sm:aspect-[4/3]"
                >
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="(min-width: 640px) 25vw, 50vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
                  />
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <span className="absolute bottom-3 left-3 text-base font-bold text-white sm:text-lg">{city.name}</span>
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
                className="inline-flex h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium transition-colors duration-150 hover:border-foreground"
              >
                {city.name}
              </Link>
            </li>
          ))}
        </ul>
      </Row>

      <Container size="wide" className="pb-12 sm:pb-16">
        <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-lime p-6 text-ink sm:flex-row sm:items-center sm:p-10">
          <p className="text-display-sm font-extrabold sm:text-display-md">Own a PG or flat?</p>
          <Link
            href={routes.listYourProperty}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-sm font-semibold text-white transition-transform duration-150 hover:scale-[1.02] motion-reduce:transition-none"
          >
            List your property
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </Container>
    </>
  );
}
