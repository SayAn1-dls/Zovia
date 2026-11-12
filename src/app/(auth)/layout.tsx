import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { routes } from "@/lib/navigation";

/** Sign-in, sign-up and password pages: a quiet frame with the logo and one column. Static. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 pt-6 sm:px-8">
        <Link href={routes.home} aria-label="ZUVIO home" className="inline-flex rounded-md text-foreground">
          <Logo />
        </Link>
      </header>
      <main id="main-content" tabIndex={-1} className="flex flex-1 justify-center px-4 py-10 outline-none sm:py-16">
        {children}
      </main>
    </div>
  );
}
