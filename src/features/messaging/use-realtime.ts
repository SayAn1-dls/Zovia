"use client";

import { useEffect, useRef } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Channel = ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]>;
export type ChangePayload = { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> };

/**
 * Subscribes to Postgres changes on one table through Supabase Realtime. RLS decides which rows
 * this user receives (spec 6.4); the callback typically refetches through `/api/v1`, so the UI
 * never trusts the event payload for anything but a hint.
 */
export function useTableChanges(options: {
  name: string;
  table: "messages" | "conversations" | "conversation_members" | "notifications";
  event?: "INSERT" | "UPDATE" | "*";
  filter?: string;
  enabled?: boolean;
  onChange: (payload: ChangePayload) => void;
  /**
   * Called each time the channel (re)joins. Events that happened before the join (page load,
   * reconnect after sleep or network loss) are not replayed, so use this to catch up.
   */
  onSubscribed?: () => void;
}) {
  const { name, table, event = "*", filter, enabled = true } = options;
  const callback = useRef(options.onChange);
  const subscribed = useRef(options.onSubscribed);
  useEffect(() => {
    callback.current = options.onChange;
    subscribed.current = options.onSubscribed;
  });

  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabaseBrowserClient();
    let channel: Channel | null = null;
    let cancelled = false;
    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(name)
        .on(
          "postgres_changes" as never,
          { event, schema: "public", table, ...(filter ? { filter } : {}) },
          (payload: ChangePayload) => callback.current(payload),
        )
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") subscribed.current?.();
        });
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [name, table, event, filter, enabled]);
}

/**
 * Private Broadcast channel "conversation:<id>" for typing indicators. Only members may join
 * (RLS on realtime.messages). Returns a throttled `notifyTyping`.
 */
export function useTypingChannel(conversationId: string, me: string, onTyping: (userId: string) => void) {
  const channelRef = useRef<Channel | null>(null);
  const lastSent = useRef(0);
  const callback = useRef(onTyping);
  useEffect(() => {
    callback.current = onTyping;
  });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    let channel: Channel | null = null;
    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase.channel(`conversation:${conversationId}`, {
        config: { private: true, broadcast: { self: false } },
      });
      channel
        .on("broadcast", { event: "typing" }, (message: { payload?: { user_id?: unknown } }) => {
          const userId = message.payload?.user_id;
          if (typeof userId === "string" && userId !== me) callback.current(userId);
        })
        .subscribe((status: string) => {
          // Only send on a joined channel; earlier sends would be dropped.
          channelRef.current = status === "SUBSCRIBED" ? channel : null;
        });
    })();
    return () => {
      cancelled = true;
      channelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [conversationId, me]);

  return function notifyTyping() {
    const now = Date.now();
    if (now - lastSent.current < 2500 || !channelRef.current) return;
    lastSent.current = now;
    void channelRef.current.send({ type: "broadcast", event: "typing", payload: { user_id: me } });
  };
}
