import { Phone } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { CookieSettingsButton } from "@/components/consent/cookie-consent";
import { WhatsAppSupportButton } from "@/components/whatsapp/whatsapp-buttons";
import { footerNav, routes } from "@/lib/navigation";
import { site } from "@/lib/site";

const linkClass =
  "inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground sm:min-h-8";

/**
 * Solid ink footer for public pages. Static: it shows no year or other request-time value, so it
 * never blocks prerendering. The support e-mail and WhatsApp button appear only when configured.
 */
export function SiteFooter() {
  return (
    <footer className="band-dark">
      <div className="mx-auto w-full max-w-7xl px-5 pt-12 pb-8 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <Link href={routes.home} aria-label="ZUVIO home" className="inline-flex h-11 items-center rounded-lg">
              <Logo size="md" />
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">{site.tagline}</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <a
                href={`tel:${site.contactPhone}`}
                className="inline-flex min-h-11 items-center gap-2 text-base font-semibold text-foreground hover:underline"
              >
                <Phone className="size-4" aria-hidden />
                {site.contactPhoneDisplay}
              </a>
              {site.supportEmail ? (
                <a href={`mailto:${site.supportEmail}`} className={linkClass}>
                  {site.supportEmail}
                </a>
              ) : null}
              <WhatsAppSupportButton variant="inverse" size="lg" />
            </div>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {footerNav.map((group) => (
              <div key={group.label}>
                <h2 className="font-sans text-sm font-semibold text-foreground">{group.label}</h2>
                <ul className="mt-2">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className={linkClass}>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                  {group.label === "Legal" ? (
                    <li>
                      <CookieSettingsButton className={`${linkClass} cursor-pointer`} />
                    </li>
                  ) : null}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-1 border-t pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {site.name} · Made in India</p>
          <Link href={`${routes.about}#photo-credits` as typeof routes.about} className="inline-flex min-h-11 items-center hover:text-foreground sm:min-h-0">
            Photo credits
          </Link>
        </div>
      </div>
    </footer>
  );
}
