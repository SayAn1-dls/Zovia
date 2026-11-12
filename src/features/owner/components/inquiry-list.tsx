import { CalendarDays, Inbox, Users } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatDateTime, initials, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { OwnerInquiry } from "../schemas";
import { InquiryReplyButton } from "./inquiry-reply-button";

/**
 * Enquiries about the owner's listings, newest first. Replying happens in the enquiry chat
 * (messaging), which marks the enquiry responded; there is no owner function to close or mark
 * an enquiry as spam yet (see the module report).
 */
export function InquiryList({ inquiries, compact = false }: { inquiries: OwnerInquiry[]; compact?: boolean }) {
  if (inquiries.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        variant={compact ? "plain" : "card"}
        title="No enquiries yet"
        description="When someone enquires about one of your published listings, it shows up here."
      />
    );
  }
  return (
    <ul className={cn("divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-border")} aria-label="Enquiries">
      {inquiries.map((inquiry) => (
        <li key={inquiry.id} className="flex gap-3 p-4 sm:gap-4 sm:p-5" data-testid="inquiry">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
            {initials(inquiry.seeker_name)}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="font-semibold break-words">{inquiry.seeker_name}</p>
              <StatusBadge status={inquiry.status} />
            </div>
            <p className="text-sm text-muted-foreground break-words">
              About <span className="font-medium text-foreground">{inquiry.property_title}</span> · {formatDateTime(inquiry.created_at)}
            </p>
            <p className={cn("text-[0.9375rem] break-words whitespace-pre-line text-foreground", compact && "line-clamp-2")}>{inquiry.message}</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden />
                {inquiry.move_in_date ? `Move-in ${formatDate(inquiry.move_in_date)}` : "Move-in date not given"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4" aria-hidden />
                {pluralize(inquiry.occupants, "person", "people")}
              </span>
            </p>
            {!compact ? (
              <div className="pt-1">
                <InquiryReplyButton inquiryId={inquiry.id} hasConversation={inquiry.conversation_id !== null} />
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
