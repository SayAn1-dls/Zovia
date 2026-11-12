import "server-only";

import { fromSupabaseError } from "@/server/http/errors";
import type { AppSupabaseClient, Database } from "@/server/supabase/types";

/** Moderation writes, all through SECURITY DEFINER functions that re-derive the caller. */

export async function callSubmitReport(
  supabase: AppSupabaseClient,
  input: {
    target_type: Database["public"]["Enums"]["report_target"];
    target_id: string;
    reason_code: string;
    details: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc("submit_report", {
    p_target_type: input.target_type,
    p_target_id: input.target_id,
    p_reason_code: input.reason_code,
    ...(input.details ? { p_details: input.details } : {}),
  });
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function callReportMessage(
  supabase: AppSupabaseClient,
  messageId: string,
  reason: string,
  details: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc("report_message", {
    p_message_id: messageId,
    p_reason: reason,
    ...(details ? { p_details: details } : {}),
  });
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function callBlockUser(supabase: AppSupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.rpc("block_user", { p_user_id: userId });
  if (error) throw fromSupabaseError(error);
}

export async function callUnblockUser(supabase: AppSupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.rpc("unblock_user", { p_user_id: userId });
  if (error) throw fromSupabaseError(error);
}
