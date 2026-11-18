import { Download } from "lucide-react";
import type { Metadata } from "next";

import { MarketingHero } from "@/components/layout/page-header";
import { Container } from "@/components/layout/section";
import { InstallAppButton } from "@/components/pwa/install-app";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Get the app",
  description: "Put Zovia on your phone. Free, no app store, two taps.",
  alternates: { canonical: "/get-the-app" },
};

/**
 * Address of a published Android APK (NEXT_PUBLIC_APK_URL: an https link or a path on this site).
 * The download button exists only when this is set, so the page never links to a file that is not there.
 */
const apkUrl = (() => {
  const value = process.env.NEXT_PUBLIC_APK_URL?.trim();
  return value && /^(https:\/\/|\/)/.test(value) ? value : null;
})();

const host = new URL(site.url).host;

const step = "flex gap-4 text-lead";
const num =
  "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background";

export default function GetTheAppPage() {
  return (
    <>
      <MarketingHero
        title={
          <>
            Zovia on your <br />
            <span className="mark-lime">home screen.</span>
          </>
        }
        description="Free. No app store. Opens like any other app."
      />
      <Container className="grid gap-14 py-12 sm:py-16 lg:grid-cols-2">
        <section aria-labelledby="android">
          <h2 id="android" className="text-xl font-bold">
            Android
          </h2>
          <ol className="mt-6 space-y-5">
            <li className={step}>
              <span className={num}>1</span>
              <span>
                Open <strong>{host}</strong> in Chrome.
              </span>
            </li>
            <li className={step}>
              <span className={num}>2</span>
              <span>
                Tap <strong>Install the Zovia app</strong> below. Or Chrome menu, then <strong>Install app</strong>.
              </span>
            </li>
            <li className={step}>
              <span className={num}>3</span>
              <span>Open Zovia from your home screen.</span>
            </li>
          </ol>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <InstallAppButton />
            {apkUrl ? (
              <a href={apkUrl} download className={buttonVariants({ size: "xl" })}>
                <Download aria-hidden />
                Download APK
              </a>
            ) : null}
          </div>
          {apkUrl ? (
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Your phone may ask to allow installs from this browser. That is normal for an app outside the Play Store.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="iphone">
          <h2 id="iphone" className="text-xl font-bold">
            iPhone
          </h2>
          <ol className="mt-6 space-y-5">
            <li className={step}>
              <span className={num}>1</span>
              <span>
                Open <strong>{host}</strong> in Safari.
              </span>
            </li>
            <li className={step}>
              <span className={num}>2</span>
              <span>
                Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
              </span>
            </li>
            <li className={step}>
              <span className={num}>3</span>
              <span>Open Zovia from your home screen.</span>
            </li>
          </ol>
        </section>
      </Container>
    </>
  );
}
