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
  description: "Questions, feedback or a problem with Zovia? Send us a message.",
  alternates: { canonical: "/contact" },
};

const linkClass =
  "font-medium text-foreground underline decoration-foreground/40 underline-offset-4 hover:decoration-foreground";

export default function ContactPage() {
  return (
    <>
      <MarketingHero title="Talk to us." description="Send a message and we will reply by e-mail." />
      <Container className="grid gap-10 py-10 sm:py-14 lg:grid-cols-[1fr_18rem] lg:gap-16">
        <div className="max-w-2xl">
          <ContactForm />
        </div>

        <aside className="space-y-5 text-[0.9375rem] leading-relaxed text-muted-foreground">
          <p>
            Reporting a person or a listing? Use Report on the profile, listing or message itself.{" "}
            <Link href={routes.safety} className={linkClass}>
              How reporting works
            </Link>
          </p>
          <p>In an emergency, call 112 first.</p>
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
