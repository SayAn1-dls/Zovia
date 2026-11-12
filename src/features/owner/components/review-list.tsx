"use client";

import { Loader2, MessageSquareReply, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/feedback/empty-state";
import { RatingStars } from "@/components/rating-stars";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";

import { replyToReviewAction } from "../actions";
import type { OwnerReview } from "../schemas";

function ReplyForm({ review }: { review: OwnerReview }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(review.reply?.body ?? "");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="outline" size="lg" onClick={() => setOpen(true)}>
        <MessageSquareReply data-icon="inline-start" aria-hidden />
        {review.reply ? "Edit reply" : "Reply publicly"}
      </Button>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await replyToReviewAction({ review_id: review.id, body });
          if (!result.ok) {
            toast.error(result.error.message);
            return;
          }
          toast.success("Reply published");
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Your public reply
        <Textarea rows={3} maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending || body.trim().length < 2}>
          {pending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : null}
          Publish reply
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ReviewList({ reviews }: { reviews: OwnerReview[] }) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title="No reviews yet"
        description="People who enquired about a published listing can review it. Their reviews, and your replies, appear here."
      />
    );
  }
  return (
    <ul className="space-y-4" aria-label="Reviews">
      {reviews.map((review) => (
        <li key={review.id} className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <RatingStars value={review.rating} />
            <span className="text-sm text-muted-foreground">{formatDate(review.created_at)}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {review.author_name} on <span className="font-medium text-foreground">{review.property_title}</span>
          </p>
          {review.title ? <p className="font-semibold">{review.title}</p> : null}
          {review.body ? <p className="text-[0.9375rem] whitespace-pre-line">{review.body}</p> : null}
          {review.reply ? (
            <div className="rounded-xl bg-muted px-4 py-3 text-sm">
              <p className="font-semibold">Your reply</p>
              <p className="mt-1 whitespace-pre-line">{review.reply.body}</p>
            </div>
          ) : null}
          <ReplyForm review={review} />
        </li>
      ))}
    </ul>
  );
}
