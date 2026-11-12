"use client";

import { Loader2, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { dynamicRoutes } from "@/lib/navigation";

import { startInquiryConversationAction } from "../actions";

/**
 * Opens the enquiry's chat (start_inquiry_conversation creates it on first use). Replying there
 * marks the enquiry "responded" in the database.
 */
export function InquiryReplyButton({ inquiryId, hasConversation }: { inquiryId: string; hasConversation: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="lg"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startInquiryConversationAction({ inquiry_id: inquiryId });
          if (!result.ok) {
            toast.error(result.error.message);
            return;
          }
          router.push(dynamicRoutes.conversation(result.data.conversation_id));
        })
      }
    >
      {pending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <MessageCircle data-icon="inline-start" aria-hidden />}
      {hasConversation ? "Open chat" : "Reply in chat"}
    </Button>
  );
}
