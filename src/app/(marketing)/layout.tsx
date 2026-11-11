import { CookieConsentBanner } from "@/components/consent/cookie-consent";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/** Public pages: navy header, content, navy footer. Static: no request data is read. */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader variant="marketing" />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
      <CookieConsentBanner />
    </>
  );
}
