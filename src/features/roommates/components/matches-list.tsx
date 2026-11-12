"use client";

import { Ban, Flag, HeartOff, MessageCircle, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReportDialog } from "@/features/moderation/components/report-dialog";
import { apiFetch } from "@/lib/api/client";
import { formatRelativeTime, initials } from "@/lib/format";
import { dynamicRoutes } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import type { MatchItem } from "../schemas";
import { PersonFacts, scoreTone } from "./candidate-card";

function MatchRow({ match }: { match: MatchItem }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"unmatch" | "block" | "report" | null>(null);
  const name = match.person?.display_name ?? match.fallback_name;
  const photo = match.person?.photo_urls[0] ?? match.person?.avatar_url ?? null;

  return (
    <li className="flex flex-col gap-4 rounded-3xl bg-card p-4 ring-1 ring-border sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-muted">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-lg font-bold" aria-hidden>
              {initials(name)}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-bold">
              {name}
              {match.person?.age ? <span className="font-medium text-muted-foreground">, {match.person.age}</span> : null}
            </h2>
            {match.compatibility && !match.compatibility.insufficient_data ? (
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", scoreTone(match.compatibility.score))}>
                {match.compatibility.score}% match
              </span>
            ) : null}
          </div>
          {match.person?.headline ? <p className="text-sm font-medium">{match.person.headline}</p> : null}
          {match.person ? <PersonFacts person={match.person} /> : null}
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>Matched {formatRelativeTime(match.matched_at)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:shrink-0">
        {match.conversation_id ? (
          <Link
            href={dynamicRoutes.conversation(match.conversation_id)}
            className={cn(buttonVariants({ size: "lg" }), "flex-1 sm:flex-none")}
          >
            <MessageCircle data-icon="inline-start" aria-hidden /> Message
          </Link>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon-lg" aria-label={`More options for ${name}`} />}>
            <MoreHorizontal aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setDialog("report")}>
              <Flag aria-hidden /> Report
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog("unmatch")}>
              <HeartOff aria-hidden /> Unmatch
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDialog("block")}>
              <Ban aria-hidden /> Block
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ConfirmDialog
        open={dialog === "unmatch"}
        onOpenChange={(open) => setDialog(open ? "unmatch" : null)}
        title={`Unmatch ${name}?`}
        description="Your chat will close and you will not see each other again in the deck."
        confirmLabel="Unmatch"
        destructive
        onConfirm={async () => {
          await apiFetch(`/roommates/matches/${match.id}`, { method: "DELETE" });
          toast.success(`You unmatched ${name}.`);
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={dialog === "block"}
        onOpenChange={(open) => setDialog(open ? "block" : null)}
        title={`Block ${name}?`}
        description="They will not be able to message you or see your profile, and the match ends."
        confirmLabel="Block"
        destructive
        onConfirm={async () => {
          await apiFetch(`/roommates/matches/${match.id}/block`, { method: "POST" });
          toast.success(`You blocked ${name}.`);
          router.refresh();
        }}
      />
      {match.person ? (
        <ReportDialog
          subject={{ kind: "target", target_type: "roommate_profile", target_id: match.person.user_id }}
          title={`Report ${name}`}
          open={dialog === "report"}
          onOpenChange={(open) => setDialog(open ? "report" : null)}
        />
      ) : null}
    </li>
  );
}

export function MatchesList({ matches }: { matches: MatchItem[] }) {
  return (
    <ul className="space-y-3">
      {matches.map((match) => (
        <MatchRow key={match.id} match={match} />
      ))}
    </ul>
  );
}
