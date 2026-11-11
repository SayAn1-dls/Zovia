"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type ReactNode, useState } from "react";

import { CookieConsentProvider } from "@/components/consent/cookie-consent";
import SessionProvider, {
  type SessionAdapter,
  signedOutAdapter,
} from "@/components/session/session-context";
import { Toaster } from "@/components/ui/sonner";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

/**
 * Client providers mounted once in the root layout: TanStack Query, nuqs URL
 * state, the session seam, cookie-consent state, reduced-motion handling and
 * the toaster. None of them read request data, so pages stay static.
 *
 * SESSION WIRING: `sessionAdapter` below is the one line to change when the
 * auth module ships its adapter (an adapter holds functions, so it cannot be
 * passed as a prop from the server-rendered root layout; it is imported here).
 * See src/components/session/session-context.tsx for the contract.
 */
const sessionAdapter: SessionAdapter = signedOutAdapter;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <SessionProvider adapter={sessionAdapter}>
          <CookieConsentProvider>
            <MotionConfig reducedMotion="user">{children}</MotionConfig>
            <Toaster position="top-center" richColors closeButton />
          </CookieConsentProvider>
        </SessionProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  );
}
