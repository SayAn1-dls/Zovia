import { Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MarketingHero } from "@/components/layout/page-header";
import { Container } from "@/components/layout/section";
import { WhatsAppSupportButton } from "@/components/whatsapp/whatsapp-buttons";
import { routes } from "@/lib/navigation";
import { site } from "@/lib/site";

import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions, feedback or a problem with ZUVIO? Send us a message.",
  alternates: { canonical: "/contact" },
};

const linkClass =
  "font-medium text-foreground underline decoration-foreground/40 underline-offset-4 hover:decoration-foreground";

export default function ContactPage() {
  return (
    <>
      <MarketingHero title="Talk to us." description="We reply by e-mail." />
      <Container className="grid gap-10 py-10 sm:py-14 lg:grid-cols-[1fr_18rem] lg:gap-16">
        <div className="max-w-2xl">
          <ContactForm />
        </div>

        <aside className="space-y-5 text-[0.9375rem] leading-relaxed text-muted-foreground">
          <p>
            <a href={`tel:${site.contactPhone}`} className="inline-flex min-h-11 items-center gap-2 text-lg font-semibold text-foreground hover:underline">
              <Phone className="size-4" aria-hidden />
              {site.contactPhoneDisplay}
            </a>
          </p>
          <p>
            Reporting someone? Use Report on the profile or listing.{" "}
            <Link href={routes.safety} className={linkClass}>
              How it works
            </Link>
          </p>
          <p>Emergency? Call 112 first.</p>
          {site.supportEmail ? (
            <p>
              <a href={`mailto:${site.supportEmail}`} className={`${linkClass} break-all`}>
                {site.supportEmail}
              </a>
            </p>
          ) : null}
          <WhatsAppSupportButton />
        </aside>
      </Container>
    </>
  );
}
