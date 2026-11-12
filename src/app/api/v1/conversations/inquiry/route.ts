import { startInquirySchema } from "@/features/messaging/schemas";
import { startInquiryConversation } from "@/features/messaging/service";
import { createHandler, ok } from "@/server/http";

/**
 * POST /api/v1/conversations/inquiry { inquiry_id }: the seeker or the owner of an enquiry opens
 * (or gets) its conversation. Anyone else gets 404.
 */
export const POST = createHandler(
  { auth: "user", label: "conversations.inquiry", body: startInquirySchema },
  async ({ supabase, user, requestId, body }) => ok(await startInquiryConversation({ supabase, user, requestId }, body.inquiry_id)),
);
