"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { routes } from "@/lib/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const KEY = ["notifications", "unread-count"] as const;

/**
 * Header bell with the unread count. The count comes from /api/v1/me/notifications/unread-count;
 * a Realtime subscription (RLS filters rows to the user) refreshes it when a notification arrives.
 */
export function NotificationBell({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => apiFetch<{ unread_count: number }>("/me/notifications/unread-count", { signal }),
    refetchInterval: 120_000,
  });
  const count = data?.unread_count ?? 0;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`bell:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: KEY });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return (
    <Link
      href={routes.notifications}
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      className={`${buttonVariants({ variant: "ghost", size: "icon-lg" })} relative`}
    >
      <Bell aria-hidden />
      {count > 0 ? (
        <span aria-hidden className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] leading-4 font-bold text-primary-foreground">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
