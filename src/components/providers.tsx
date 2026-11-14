"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type ReactNode, useState } from "react";

import { CookieConsentProvider } from "@/components/consent/cookie-consent";
import SessionProvider, { type SessionAdapter } from "@/components/session/session-context";
import { ServiceWorkerRegistration } from "@/components/pwa/install-app";
import { Toaster } from "@/components/ui/sonner";
import { supabaseSessionAdapter } from "@/features/auth/session-adapter";

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
 * state, the session seam, cookie-consent state and the toaster. None of them read request data, so pages stay static.
 *
 * SESSION WIRING: `sessionAdapter` below is the one line to change when the
 * auth module ships its adapter (an adapter holds functions, so it cannot be
 * passed as a prop from the server-rendered root layout; it is imported here).
 * See src/components/session/session-context.tsx for the contract.
 */
const sessionAdapter: SessionAdapter = supabaseSessionAdapter;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <SessionProvider adapter={sessionAdapter}>
          <CookieConsentProvider>
            {children}
            <Toaster position="top-center" closeButton />
            <ServiceWorkerRegistration />
          </CookieConsentProvider>
        </SessionProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  );
}
