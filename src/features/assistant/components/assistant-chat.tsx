"use client";

import { ArrowUp, Info, RotateCcw, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PropertyCard } from "@/features/properties/components/property-card";
import { isApiError } from "@/lib/api/client";
import { routes, withQuery } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import { useAssistantChat } from "../queries";
import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  type AssistantMode,
  type AssistantReply,
  type HistoryMessage,
} from "../schemas";

type Turn =
  | { id: number; role: "user"; content: string }
  | { id: number; role: "assistant"; reply: AssistantReply };

const SUGGESTIONS = [
  "PG in Bengaluru under ₹8000 with food and Wi-Fi",
  "Girls hostel in Pune under ₹10k",
  "1 BHK in Hyderabad between ₹12000 and ₹18000",
  "What should I check when I visit a PG?",
  "How much security deposit is normal?",
];

function historyOf(turns: readonly Turn[]): HistoryMessage[] {
  return turns
    .map((turn): HistoryMessage =>
      turn.role === "user"
        ? { role: "user", content: turn.content }
        : {
            role: "assistant",
            content: [turn.reply.message, turn.reply.follow_up_question].filter(Boolean).join(" "),
          },
    )
    .slice(-MAX_HISTORY_MESSAGES);
}

function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === "rate_limited") return error.message;
    if (error.code === "network") return "You seem to be offline. Check your connection and try again.";
    if (error.code === "validation_failed") return "That message couldn't be sent. Try a shorter message.";
    if (error.code === "unauthenticated") return "Your session ended. Sign in again to keep chatting.";
  }
  return "The assistant couldn't answer just now. Please try again.";
}

export function AssistantChat({ initialMode }: { initialMode: AssistantMode }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState<{ message: string; text: string } | null>(null);
  const [mode, setMode] = useState<AssistantMode>(initialMode);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chat = useAssistantChat();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, chat.isPending, failed]);

  function send(text: string) {
    const message = text.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_CHARS);
    if (!message || chat.isPending) return;
    const history = historyOf(turns);
    const userTurn: Turn = { id: nextId.current++, role: "user", content: message };
    setTurns((current) => [...current, userTurn]);
    setDraft("");
    setFailed(null);
    chat.mutate(
      { message, history },
      {
        onSuccess: (reply) => {
          setMode(reply.mode);
          setTurns((current) => [...current, { id: nextId.current++, role: "assistant", reply }]);
        },
        onError: (error) => {
          // Take the unanswered message back out so a retry does not duplicate it.
          setTurns((current) => current.filter((turn) => turn.id !== userTurn.id));
          setFailed({ message: errorMessage(error), text: message });
        },
        onSettled: () => inputRef.current?.focus(),
      },
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    send(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(draft);
    }
  }

  function reset() {
    setTurns([]);
    setFailed(null);
    chat.reset();
    inputRef.current?.focus();
  }

  const empty = turns.length === 0 && !chat.isPending;

  return (
    <div className="flex min-h-[60vh] flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {mode === "ai" ? (
          <Badge variant="secondary">
            <Sparkles aria-hidden /> AI assistant
          </Badge>
        ) : (
          <Badge variant="warning">Basic mode</Badge>
        )}
        <p className="text-xs text-muted-foreground">
          {mode === "ai"
            ? "Listings come straight from Zovia; the assistant can make mistakes in its wording."
            : "Understands city, budget, type, food, Wi-Fi, AC and who it's for. Listings come straight from Zovia."}
        </p>
        {turns.length > 0 ? (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>
            <RotateCcw aria-hidden /> New chat
          </Button>
        ) : null}
      </div>

      <div role="log" aria-live="polite" aria-label="Conversation" className="flex flex-1 flex-col gap-5 pb-4">
        {empty ? (
          <div className="rounded-2xl bg-secondary/60 px-5 py-8 text-center sm:px-8">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-card text-foreground ring-1 ring-border">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <h2 className="mt-4 font-heading text-xl font-semibold tracking-tight">Tell me what you&apos;re looking for</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              City, budget and must-haves are enough. I only show real, published listings.
            </p>
            <ul className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => send(suggestion)}
                    className="min-h-11 rounded-full bg-card px-4 py-2 text-left text-sm font-medium ring-1 ring-border transition-colors hover:ring-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {turns.map((turn) =>
          turn.role === "user" ? (
            <div key={turn.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground sm:max-w-[70%]">
                <span className="sr-only">You: </span>
                {turn.content}
              </p>
            </div>
          ) : (
            <AssistantTurn key={turn.id} reply={turn.reply} />
          ),
        )}

        {chat.isPending ? (
          <div className="flex max-w-[85%] flex-col gap-2" role="status" aria-label="The assistant is answering">
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-4 w-48 max-w-full" />
            <p className="text-xs text-muted-foreground">
              {mode === "ai" ? "Searching listings…" : "Searching…"}
            </p>
          </div>
        ) : null}

        {failed ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-2xl bg-danger-surface px-4 py-3 text-sm text-danger-foreground sm:flex-row sm:items-center"
          >
            <p className="flex-1">{failed.message}</p>
            <Button variant="outline" size="sm" onClick={() => send(failed.text)}>
              Try again
            </Button>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={onSubmit}
        className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 mt-auto flex items-end gap-2 rounded-2xl bg-card p-2 shadow-lg ring-1 ring-border md:bottom-4"
      >
        <label htmlFor="assistant-input" className="sr-only">
          Message the assistant
        </label>
        <Textarea
          id="assistant-input"
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_MESSAGE_CHARS}
          rows={1}
          placeholder="e.g. PG near Koramangala under ₹9000 with food"
          className="max-h-40 min-h-11 resize-none border-0 bg-transparent py-2.5 shadow-none focus-visible:ring-0"
          aria-describedby="assistant-input-hint"
        />
        <Button
          type="submit"
          size="icon-lg"
          disabled={chat.isPending || draft.trim() === ""}
          aria-label="Send message"
        >
          <ArrowUp aria-hidden />
        </Button>
        <span id="assistant-input-hint" className="sr-only">
          Press Enter to send, Shift and Enter for a new line.
        </span>
      </form>
    </div>
  );
}

function AssistantTurn({ reply }: { reply: AssistantReply }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-card px-4 py-3 text-sm leading-relaxed ring-1 ring-border sm:max-w-[75%]">
        <span className="sr-only">Assistant: </span>
        <p className="whitespace-pre-line">{reply.message}</p>
        {reply.follow_up_question ? <p className="mt-2 font-medium">{reply.follow_up_question}</p> : null}
      </div>
      {reply.properties.length > 0 ? (
        <section aria-label={reply.alternatives ? "Close alternatives" : "Matching listings"} className="flex flex-col gap-3">
          {reply.alternatives ? (
            <p className="flex items-center gap-2 text-sm font-medium">
              <Info className="size-4 text-warning-foreground" aria-hidden />
              Close alternatives, not exact matches
            </p>
          ) : null}
          <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3")}>
            {reply.properties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        </section>
      ) : null}
      {reply.search_query ? (
        <Link
          href={withQuery(routes.search, reply.search_query)}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full px-1 text-sm font-medium underline decoration-foreground/40 underline-offset-4 hover:decoration-foreground"
        >
          <Search className="size-4" aria-hidden /> See these filters on Search
        </Link>
      ) : null}
    </div>
  );
}
