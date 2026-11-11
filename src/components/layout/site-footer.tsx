import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { CookieSettingsButton } from "@/components/consent/cookie-consent";
import { WhatsAppSupportButton } from "@/components/whatsapp/whatsapp-buttons";
import { footerNav, routes } from "@/lib/navigation";
import { site } from "@/lib/site";

const linkClass =
  "inline-flex min-h-11 items-center text-[0.9375rem] text-muted-foreground transition-colors duration-150 hover:text-foreground sm:min-h-9";

/**
 * Navy footer band for public pages. Static: it shows no year or other
 * request-time value, so it never blocks prerendering. The support e-mail and
 * the WhatsApp button appear only when configured.
 */
export function SiteFooter() {
  return (
    <footer className="band-dark">
      <div className="mx-auto w-full max-w-6xl px-5 pt-14 pb-10 sm:px-8 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr]">
          <div>
            <Link href={routes.home} aria-label="ZUVIO home" className="inline-flex rounded-lg">
              <Logo size="md" />
            </Link>
            <p className="mt-4 max-w-xs text-[0.9375rem] leading-relaxed text-muted-foreground">
              {site.tagline} Homes and roommates for students and working
              professionals in India.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <WhatsAppSupportButton variant="inverse" size="lg" />
              {site.supportEmail ? (
                <a href={`mailto:${site.supportEmail}`} className={linkClass}>
                  {site.supportEmail}
                </a>
              ) : null}
            </div>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {footerNav.map((group) => (
              <div key={group.label}>
                <h2 className="font-sans text-sm font-semibold text-foreground">{group.label}</h2>
                <ul className="mt-3 sm:space-y-0.5">
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

        <div className="mt-12 flex flex-col gap-2 border-t pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {site.name}. Made in India.</p>
          <p>A match or an enquiry on ZUVIO is never a booking.</p>
        </div>
      </div>
    </footer>
  );
}
