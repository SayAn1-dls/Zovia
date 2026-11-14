import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { routes } from "@/lib/navigation";

/** Becoming an owner: logo only, like the main onboarding. */
export default function OwnerOnboardingLayout({ children }: LayoutProps<"/owner/onboarding">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 pt-6 sm:px-8">
        <Link href={routes.home} aria-label="Zovia home" className="inline-flex rounded-md text-foreground">
          <Logo />
        </Link>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 outline-none sm:py-14">
        {children}
      </main>
    </div>
  );
}
