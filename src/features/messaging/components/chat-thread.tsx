"use client";

import { Ban, Flag, HeartOff, ImagePlus, Loader2, MoreHorizontal, SendHorizontal, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormMessage } from "@/components/form/form-field";
import { resizeImageToWebp, validateImageFile } from "@/components/image-uploader/resize";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { ReportDialog, type ReportSubject } from "@/features/moderation/components/report-dialog";
import { apiFetch, isApiError } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

import {
  CHAT_ATTACHMENT_MAX_BYTES,
  MESSAGE_MAX_LENGTH,
  type ChatMessage,
  type ConversationDetail,
  type MessagesPage,
  type SendResult,
} from "../schemas";
import { useTableChanges, useTypingChannel } from "../use-realtime";
import { PersonAvatar } from "./conversation-list";

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
  );
}

function time(value: string): string {
  return new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function Bubble({
  message,
  mine,
  seen,
  onReport,
}: {
  message: ChatMessage;
  mine: boolean;
  seen: boolean;
  onReport: () => void;
}) {
  if (message.kind === "system") {
    return (
      <li className="mx-auto max-w-sm rounded-2xl bg-muted px-4 py-2 text-center text-xs text-muted-foreground">
        {message.body}
      </li>
    );
  }
  return (
    <li className={cn("group flex flex-col gap-1", mine ? "items-end" : "items-start")} data-testid="chat-message">
      <div className={cn("flex max-w-[85%] items-end gap-1 sm:max-w-[70%]", mine ? "flex-row-reverse" : "flex-row")}>
        <div
          className={cn(
            "min-w-0 rounded-3xl px-4 py-2.5 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap",
            mine ? "rounded-br-lg bg-ink text-white" : "rounded-bl-lg bg-card text-foreground ring-1 ring-border",
          )}
        >
          {message.attachments.map((attachment) =>
            attachment.url ? (
              // Signed URL from the private chat-attachments bucket.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={attachment.id}
                src={attachment.url}
                alt="Shared photo"
                className="mb-1.5 max-h-72 w-auto rounded-2xl"
                width={attachment.width ?? undefined}
                height={attachment.height ?? undefined}
              />
            ) : null,
          )}
          {message.body}
        </div>
        {!mine ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label="Report this message"
            onClick={onReport}
          >
            <Flag aria-hidden />
          </Button>
        ) : null}
      </div>
      <span className="px-2 text-[0.6875rem] text-muted-foreground">
        <time suppressHydrationWarning dateTime={message.created_at} title={formatDateTime(message.created_at)}>
          {time(message.created_at)}
        </time>
        {mine && seen ? " · Seen" : ""}
      </span>
    </li>
  );
}

export function ChatThread({ detail, initial }: { detail: ConversationDetail; initial: MessagesPage }) {
  const router = useRouter();
  const id = detail.id;
  const me = detail.me;
  const otherName = detail.other?.display_name ?? "Former member";
  const [messages, setMessages] = useState(initial.messages);
  const [hasMore, setHasMore] = useState(initial.has_more);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [status, setStatus] = useState(detail.status);
  const [blocked, setBlocked] = useState(detail.blocked_by_me);
  const [otherReadAt, setOtherReadAt] = useState(detail.other_last_read_at);
  const [typing, setTyping] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [report, setReport] = useState<ReportSubject | null>(null);
  const [dialog, setDialog] = useState<"block" | "unmatch" | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const preserveFrom = useRef<number | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastMarked = useRef(0);

  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastMarked.current < 1500) return;
    lastMarked.current = now;
    void apiFetch(`/conversations/${id}/read`, { method: "POST" }).catch(() => undefined);
  }, [id]);

  const fetchNewer = useCallback(async () => {
    const last = messages.at(-1)?.created_at;
    try {
      const incoming = await apiFetch<ChatMessage[]>(`/conversations/${id}/messages`, {
        query: last ? { after: last, limit: 50 } : { limit: 30 },
      });
      if (incoming.length === 0) return;
      setMessages((current) => mergeMessages(current, incoming));
      if (incoming.some((message) => message.sender_id !== me)) {
        setTyping(false);
        markRead();
      }
    } catch {
      // Realtime will deliver the next event; a reload always shows the full history.
    }
  }, [id, me, messages, markRead]);

  useTableChanges({
    name: `thread-messages:${id}`,
    table: "messages",
    event: "INSERT",
    filter: `conversation_id=eq.${id}`,
    onChange: () => void fetchNewer(),
    onSubscribed: () => void fetchNewer(),
  });
  useTableChanges({
    name: `thread-members:${id}`,
    table: "conversation_members",
    event: "UPDATE",
    filter: `conversation_id=eq.${id}`,
    onChange: (payload) => {
      if (payload.new.user_id !== me && typeof payload.new.last_read_at === "string") {
        setOtherReadAt(payload.new.last_read_at);
      }
    },
  });
  useTableChanges({
    name: `thread-conversation:${id}`,
    table: "conversations",
    event: "UPDATE",
    filter: `id=eq.${id}`,
    onChange: (payload) => {
      if (payload.new.status === "closed" || payload.new.status === "active") setStatus(payload.new.status);
    },
  });
  const notifyTyping = useTypingChannel(id, me, () => {
    setTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 4000);
  });

  useEffect(() => {
    markRead();
    const onVisible = () => markRead();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [markRead]);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (preserveFrom.current !== null) {
      element.scrollTop = element.scrollHeight - preserveFrom.current;
      preserveFrom.current = null;
    } else if (stickToBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, typing]);

  async function loadOlder() {
    const first = messages[0]?.created_at;
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await apiFetch<ChatMessage[]>(`/conversations/${id}/messages`, { query: { before: first, limit: 30 } });
      preserveFrom.current = scroller.current ? scroller.current.scrollHeight - scroller.current.scrollTop : null;
      setHasMore(older.length >= 30);
      setMessages((current) => mergeMessages(current, older));
    } catch {
      toast.error("Older messages did not load. Try again.");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(attachment?: { storage_path: string; width: number; height: number }) {
    const text = body.trim();
    if ((!text && !attachment) || sending) return;
    setSending(true);
    setWarning(null);
    setFailure(null);
    try {
      const result = await apiFetch<SendResult>(`/conversations/${id}/messages`, {
        method: "POST",
        body: { body: text, ...(attachment ? { attachment } : {}) },
      });
      if (result.status === "blocked") {
        setWarning(result.warning);
      } else {
        stickToBottom.current = true;
        setMessages((current) => mergeMessages(current, [result.message]));
        setBody("");
      }
    } catch (error) {
      const message = isApiError(error) ? error.message : "Not sent. Check your connection and try again.";
      setFailure(message);
      if (isApiError(error) && error.code === "conflict") setStatus("closed");
    } finally {
      setSending(false);
    }
  }

  async function attach(file: File) {
    const problem = validateImageFile(file, { maxBytes: CHAT_ATTACHMENT_MAX_BYTES * 4 });
    if (problem) {
      setFailure(problem.message);
      return;
    }
    setSending(true);
    try {
      const prepared = await resizeImageToWebp(file, { maxDimension: 1600 });
      if (prepared.file.size > CHAT_ATTACHMENT_MAX_BYTES) throw new Error("That image is too large.");
      const extension = prepared.file.type === "image/png" ? "png" : prepared.file.type === "image/jpeg" ? "jpg" : "webp";
      const path = `${id}/${me}/${crypto.randomUUID()}.${extension}`;
      const { error } = await getSupabaseBrowserClient()
        .storage.from("chat-attachments")
        .upload(path, prepared.file, { contentType: prepared.file.type, upsert: false });
      if (error) throw new Error("The photo did not upload. Try again.");
      setSending(false);
      await send({ storage_path: path, width: prepared.width, height: prepared.height });
    } catch (error) {
      setSending(false);
      setFailure(error instanceof Error ? error.message : "The photo did not upload. Try again.");
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  const lastMine = [...messages].reverse().find((message) => message.sender_id === me);
  const seenId =
    lastMine && otherReadAt && Date.parse(otherReadAt) >= Date.parse(lastMine.created_at) ? lastMine.id : null;
  const canSend = status === "active" && !blocked;

  return (
    <div className="mx-auto flex h-[calc(100dvh-12.5rem)] min-h-[26rem] max-w-3xl flex-col overflow-hidden rounded-3xl bg-paper ring-1 ring-border lg:h-[calc(100dvh-10rem)]">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <PersonAvatar name={otherName} url={detail.other?.avatar_url ?? null} className="size-10" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold">{otherName}</h2>
          <p className="truncate text-xs text-muted-foreground" aria-live="polite">
            {typing
              ? `${otherName} is typing…`
              : detail.kind === "property_inquiry"
                ? `Enquiry${detail.property_title ? ` · ${detail.property_title}` : ""}`
                : "Roommate match"}
          </p>
        </div>
        {detail.other ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Conversation options" />}>
              <MoreHorizontal aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => setReport({ kind: "target", target_type: "user", target_id: detail.other!.user_id })}
              >
                <Flag aria-hidden /> Report {otherName}
              </DropdownMenuItem>
              {detail.match_id && status === "active" ? (
                <DropdownMenuItem onClick={() => setDialog("unmatch")}>
                  <HeartOff aria-hidden /> Unmatch
                </DropdownMenuItem>
              ) : null}
              {!blocked ? (
                <DropdownMenuItem variant="destructive" onClick={() => setDialog("block")}>
                  <Ban aria-hidden /> Block
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5"
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {hasMore ? (
          <div className="mb-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => void loadOlder()} disabled={loadingOlder}>
              {loadingOlder ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : null}
              Load earlier messages
            </Button>
          </div>
        ) : null}
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hi!</p>
        ) : null}
        <ol className="space-y-3" aria-label={`Messages with ${otherName}`} aria-live="polite" aria-relevant="additions">
          {messages.map((message) => (
            <Bubble
              key={message.id}
              message={message}
              mine={message.sender_id === me}
              seen={message.id === seenId}
              onReport={() => setReport({ kind: "message", id: message.id })}
            />
          ))}
        </ol>
        {typing ? (
          <p className="mt-3 text-xs text-muted-foreground" aria-hidden>
            {otherName} is typing…
          </p>
        ) : null}
      </div>

      <div className="border-t border-border bg-card p-3">
        {warning ? (
          <FormMessage tone="warning" className="mb-2" title="Message not sent">
            <span className="flex items-start gap-1.5" data-testid="contact-warning">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {warning}
            </span>
          </FormMessage>
        ) : null}
        {failure ? (
          <FormMessage tone="danger" className="mb-2">
            {failure}
          </FormMessage>
        ) : null}
        {canSend ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void attach(file);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Send a photo"
              disabled={sending}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus aria-hidden />
            </Button>
            <label htmlFor={`composer-${id}`} className="sr-only">
              Message {otherName}
            </label>
            <Textarea
              id={`composer-${id}`}
              rows={1}
              value={body}
              maxLength={MESSAGE_MAX_LENGTH}
              placeholder="Write a message"
              className="max-h-36 min-h-11 flex-1 resize-none"
              onChange={(event) => {
                setBody(event.target.value);
                if (warning) setWarning(null);
                notifyTyping();
              }}
              onKeyDown={onKeyDown}
            />
            <Button type="submit" size="icon-lg" aria-label="Send" disabled={sending || body.trim().length === 0}>
              {sending ? <Loader2 className="animate-spin" aria-hidden /> : <SendHorizontal aria-hidden />}
            </Button>
          </form>
        ) : (
          <p className="py-2 text-center text-sm text-muted-foreground" role="status">
            {blocked ? `You blocked ${otherName}. Messages are off.` : "This chat has ended."}
          </p>
        )}
      </div>

      {report ? (
        <ReportDialog
          subject={report}
          title={report.kind === "message" ? "Report this message" : `Report ${otherName}`}
          open
          onOpenChange={(open) => (open ? null : setReport(null))}
        />
      ) : null}
      <ConfirmDialog
        open={dialog === "unmatch"}
        onOpenChange={(open) => setDialog(open ? "unmatch" : null)}
        title={`Unmatch ${otherName}?`}
        description="The chat closes for both of you and you will not see each other in the deck again."
        confirmLabel="Unmatch"
        destructive
        onConfirm={async () => {
          await apiFetch(`/conversations/${id}/unmatch`, { method: "POST" });
          setStatus("closed");
          toast.success(`You unmatched ${otherName}.`);
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={dialog === "block"}
        onOpenChange={(open) => setDialog(open ? "block" : null)}
        title={`Block ${otherName}?`}
        description="Neither of you can message the other any more. A roommate match ends."
        confirmLabel="Block"
        destructive
        onConfirm={async () => {
          await apiFetch(`/conversations/${id}/block`, { method: "POST" });
          setBlocked(true);
          toast.success(`You blocked ${otherName}.`);
          router.refresh();
        }}
      />
    </div>
  );
}
