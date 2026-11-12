"use client";

import {
  Bell,
  BellOff,
  CheckCheck,
  Heart,
  Home,
  Loader2,
  MessageCircle,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { useTableChanges } from "@/features/messaging/use-realtime";
import { apiFetch } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { NotificationItem, NotificationsPage, NotificationType } from "../schemas";

const ICONS: Partial<Record<NotificationType, LucideIcon>> = {
  new_message: MessageCircle,
  roommate_match: Heart,
  inquiry_received: Home,
  inquiry_responded: Home,
  contact_warning: ShieldAlert,
  moderation_warning: ShieldAlert,
  restriction_applied: ShieldAlert,
  account_suspended: ShieldAlert,
};

function merge(current: NotificationItem[], incoming: NotificationItem[]): NotificationItem[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function NotificationList({ me, initial }: { me: string; initial: NotificationsPage }) {
  const router = useRouter();
  const [items, setItems] = useState(initial.items);
  const [unread, setUnread] = useState(initial.unread_count);
  const [hasMore, setHasMore] = useState(initial.has_more);
  const [loadingMore, setLoadingMore] = useState(false);
  const [marking, setMarking] = useState(false);

  const refreshLatest = useCallback(async () => {
    try {
      const page = await apiFetch<NotificationsPage>("/me/notifications", { query: { limit: 20 } });
      setItems((current) => merge(current, page.items));
      setUnread(page.unread_count);
    } catch {
      // Keep what is shown; the next event or a reload tries again.
    }
  }, []);

  useTableChanges({
    name: `notifications:${me}`,
    table: "notifications",
    filter: `user_id=eq.${me}`,
    onChange: () => void refreshLatest(),
    onSubscribed: () => void refreshLatest(),
  });

  async function loadMore() {
    const last = items.at(-1)?.created_at;
    if (!last) return;
    setLoadingMore(true);
    try {
      const page = await apiFetch<NotificationsPage>("/me/notifications", { query: { before: last, limit: 20 } });
      setItems((current) => merge(current, page.items));
      setHasMore(page.has_more);
    } catch {
      toast.error("Could not load more. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function markAll() {
    setMarking(true);
    try {
      await apiFetch("/me/notifications/read", { method: "POST", body: {} });
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
      setUnread(0);
    } catch {
      toast.error("That did not work. Try again.");
    } finally {
      setMarking(false);
    }
  }

  async function open(item: NotificationItem) {
    if (!item.read_at) {
      setItems((current) => current.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)));
      setUnread((count) => Math.max(0, count - 1));
      void apiFetch("/me/notifications/read", { method: "POST", body: { ids: [item.id] } }).catch(() => undefined);
    }
    if (item.link_path) router.push(item.link_path as Route);
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title="You're all caught up"
        description="Matches, messages and updates about your enquiries will show up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {unread > 0 ? `${unread} unread` : "Everything is read"}
        </p>
        <Button variant="outline" size="lg" onClick={() => void markAll()} disabled={marking || unread === 0}>
          {marking ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <CheckCheck data-icon="inline-start" aria-hidden />}
          Mark all read
        </Button>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-3xl bg-card ring-1 ring-border" aria-label="Notifications">
        {items.map((item) => {
          const Icon = ICONS[item.type] ?? Bell;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void open(item)}
                className={cn(
                  "flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                  !item.read_at && "bg-lime/15",
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn("text-[0.9375rem]", item.read_at ? "font-medium" : "font-bold")}>
                      {!item.read_at ? <span className="sr-only">Unread: </span> : null}
                      {item.title}
                    </span>
                    <time suppressHydrationWarning className="shrink-0 text-xs text-muted-foreground" dateTime={item.created_at}>
                      {formatRelativeTime(item.created_at)}
                    </time>
                  </span>
                  {item.body ? <span className="mt-0.5 block text-sm break-words text-muted-foreground">{item.body}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="outline" size="lg" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : null}
            Show older
          </Button>
        </div>
      ) : null}
    </div>
  );
}
