import "server-only";

import { unwrap } from "@/server/http/errors";
import type { AppSupabaseClient } from "@/server/supabase/types";
import type { Json } from "@/lib/database.types";

/**
 * Assistant data access, always as the signed-in caller: the daily quota and usage log are
 * SECURITY DEFINER functions keyed by auth.uid(); search history is RLS "own rows only".
 */

export type UsageRecord = {
  provider: string;
  model: string;
  feature: string;
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
  latency_ms: number;
  status: "success" | "error" | "rate_limited";
  error_code: string | null;
};

/** One hit against "max per window" for this user; false = over the limit. */
export async function consumeQuota(
  supabase: AppSupabaseClient,
  action: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  return unwrap(
    await supabase.rpc("consume_rate_limit", { p_action: action, p_max: max, p_window_seconds: windowSeconds }),
  ) as boolean;
}

export async function logUsage(supabase: AppSupabaseClient, record: UsageRecord): Promise<void> {
  unwrap(
    await supabase.rpc("log_ai_usage", {
      p_provider: record.provider,
      p_model: record.model.slice(0, 100),
      p_feature: record.feature,
      p_input_tokens: Math.max(0, Math.round(record.input_tokens)),
      p_output_tokens: Math.max(0, Math.round(record.output_tokens)),
      p_tool_calls: Math.max(0, Math.round(record.tool_calls)),
      p_latency_ms: Math.max(0, Math.round(record.latency_ms)),
      p_status: record.status,
      ...(record.error_code ? { p_error_code: record.error_code.slice(0, 100) } : {}),
    }),
  );
}

export async function insertSearchHistory(
  supabase: AppSupabaseClient,
  row: { user_id: string; query_text: string; filters: { [key: string]: Json | undefined }; result_count: number },
): Promise<void> {
  unwrap(await supabase.from("search_history").insert({ ...row, source: "assistant" }));
}
