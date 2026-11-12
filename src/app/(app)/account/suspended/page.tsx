import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { routes } from "@/lib/navigation";
import { site } from "@/lib/site";
import { getCurrentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Account suspended", robots: { index: false } };

/**
 * Where suspended accounts land (the proxy sends them here). Appeals arrive with the moderation
 * module; until then the page says plainly how to reach the team.
 */
export default function SuspendedPage() {
  return (
    <div className="mx-auto max-w-xl">
      <Suspense fallback={<LoadingState variant="page" label="Loading your account" />}>
        <SuspendedBody />
      </Suspense>
    </div>
  );
}

async function SuspendedBody() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.signIn);
  if (user.status !== "suspended") redirect(routes.search);
  return (
    <>
      <h1 className="text-display-sm font-extrabold text-foreground">Your account is suspended.</h1>
      <p className="mt-3 text-[0.9375rem] text-muted-foreground">
        A moderator suspended this account after a report or a safety check. While it is suspended you cannot
        search, message or list properties.
      </p>
      <p className="mt-3 text-[0.9375rem] text-muted-foreground">
        If you think this is a mistake, write to us
        {site.supportEmail ? (
          <>
            {" "}at{" "}
            <a href={`mailto:${site.supportEmail}`} className="font-semibold text-foreground underline underline-offset-4">
              {site.supportEmail}
            </a>
          </>
        ) : (
          <> through the contact page</>
        )}
        {" "}and include the e-mail address you signed up with.
      </p>
    </>
  );
}
