"use client";

import { Home, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import { formatRelativeTime, initials } from "@/lib/format";
import { dynamicRoutes } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import type { ConversationListItem } from "../schemas";
import { useTableChanges } from "../use-realtime";

export function PersonAvatar({ name, url, className }: { name: string; url: string | null; className?: string }) {
  return (
    <span className={cn("relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-bold", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}

/** Conversation list that refreshes live when a message arrives or a chat is read elsewhere. */
export function ConversationList({ me, initial }: { me: string; initial: ConversationListItem[] }) {
  const [items, setItems] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const page = await apiFetch<{ items: ConversationListItem[] }>("/conversations", { query: { limit: 50 } });
      setItems(page.items);
    } catch {
      // Keep the current list; the next event or a reload will try again.
    }
  }, []);

  useTableChanges({
    name: `inbox-messages:${me}`,
    table: "messages",
    event: "INSERT",
    onChange: () => void refresh(),
    onSubscribed: () => void refresh(),
  });
  useTableChanges({
    name: `inbox-members:${me}`,
    table: "conversation_members",
    filter: `user_id=eq.${me}`,
    onChange: () => void refresh(),
  });

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl bg-card ring-1 ring-border" aria-label="Conversations">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={dynamicRoutes.conversation(item.id)}
            className="flex items-center gap-4 p-4 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <PersonAvatar name={item.title} url={item.other?.avatar_url ?? null} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className={cn("truncate text-[0.9375rem]", item.unread_count > 0 ? "font-bold" : "font-semibold")}>{item.title}</p>
                {item.last_message_at ? (
                  <time suppressHydrationWarning className="shrink-0 text-xs text-muted-foreground" dateTime={item.last_message_at}>
                    {formatRelativeTime(item.last_message_at)}
                  </time>
                ) : null}
              </div>
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                {item.kind === "property_inquiry" ? <Home className="size-3 shrink-0" aria-hidden /> : <Users className="size-3 shrink-0" aria-hidden />}
                <span className="truncate">
                  {item.subtitle}
                  {item.status === "closed" ? " · Ended" : ""}
                </span>
              </p>
              <div className="mt-0.5 flex items-center justify-between gap-3">
                <p className={cn("truncate text-sm", item.unread_count > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {item.last_message_preview ?? "No messages yet"}
                </p>
                {item.unread_count > 0 ? (
                  <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-ink px-1.5 text-xs font-bold text-white">
                    <span className="sr-only">Unread messages: </span>
                    {item.unread_count > 99 ? "99+" : item.unread_count}
                  </span>
                ) : null}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
