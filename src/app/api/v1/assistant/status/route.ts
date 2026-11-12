import { getAssistantStatus } from "@/features/assistant/service";
import { createHandler, ok } from "@/server/http";

/** GET /api/v1/assistant/status: `{ mode: "ai" | "basic" }` (basic when no AI provider is configured). */
export const GET = createHandler({ auth: "user", label: "assistant.status" }, () => ok(getAssistantStatus()));
