import "server-only";

import type { UserServiceContext } from "@/server/auth/context";

import * as repo from "./repository";
import type { MessageReportInput, ReportInput } from "./schemas";

/**
 * Reports and blocks. The database enforces who may report what (target must exist and be
 * visible, not oneself, one open report per target, daily cap); this layer only orchestrates.
 */

export async function submitReport(ctx: UserServiceContext, input: ReportInput): Promise<{ id: string }> {
  return { id: await repo.callSubmitReport(ctx.supabase, input) };
}

export async function reportMessage(
  ctx: UserServiceContext,
  messageId: string,
  input: MessageReportInput,
): Promise<{ id: string }> {
  return { id: await repo.callReportMessage(ctx.supabase, messageId, input.reason, input.details) };
}

/** Blocks a user. Callers derive `userId` from a row the caller can see (a match or conversation). */
export async function blockUser(ctx: UserServiceContext, userId: string): Promise<void> {
  await repo.callBlockUser(ctx.supabase, userId);
}

export async function unblockUser(ctx: UserServiceContext, userId: string): Promise<void> {
  await repo.callUnblockUser(ctx.supabase, userId);
}
