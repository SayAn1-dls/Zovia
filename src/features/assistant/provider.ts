import type { HistoryMessage, PresentResults } from "./schemas";

/**
 * The AI provider seam (spec section 8). A provider runs one assistant turn: it may call the
 * tools any number of times (bounded) and finishes with a `present_results` payload or plain
 * text. It never touches the database itself; tools do, as the caller.
 */

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
};

export type ToolOutcome = { content: unknown; is_error?: boolean };

export interface ToolRuntime {
  readonly definitions: readonly ToolDefinition[];
  run(name: string, input: unknown): Promise<ToolOutcome>;
}

export type ProviderInput = {
  system: string;
  history: readonly HistoryMessage[];
  message: string;
  tools: ToolRuntime;
};

export type ProviderResult = {
  /** "presented": a valid present_results call; "text": plain text only; "refusal": declined. */
  outcome: "presented" | "text" | "refusal" | "incomplete";
  present: PresentResults | null;
  text: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
};

export interface AIProvider {
  /** Lower-case slug written to ai_usage_logs.provider. */
  readonly name: string;
  readonly model: string;
  respond(input: ProviderInput): Promise<ProviderResult>;
}

/** Name of the final-answer tool every provider must expose. */
export const PRESENT_RESULTS_TOOL = "present_results";
