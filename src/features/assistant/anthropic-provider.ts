import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import {
  PRESENT_RESULTS_TOOL,
  type AIProvider,
  type ProviderInput,
  type ProviderResult,
  type ToolDefinition,
} from "./provider";
import { presentResultsSchema } from "./schemas";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResultParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;

/** Model calls per assistant turn (tool rounds + the final answer). */
const MAX_STEPS = 6;
const MAX_TOOL_RESULT_CHARS = 12_000;
const MAX_OUTPUT_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 45_000;

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`) on the Claude API. */
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

export const PRESENT_RESULTS_DEFINITION: ToolDefinition = {
  name: PRESENT_RESULTS_TOOL,
  description:
    "Give your final answer to the user. Always finish a turn by calling this exactly once. `message` is a short, friendly reply (plain text, no markdown tables). `property_ids` lists ids of listings to show as cards, best first; use only ids returned by search_properties, get_property or compare_properties in this turn. Set `alternatives` to true when the listings are not exact matches for what the user asked. Use `follow_up_question` for one clarifying question (for example when the city or budget is missing).",
  input_schema: {
    type: "object",
    properties: {
      message: { type: "string", description: "Your reply to the user, at most a few short sentences." },
      property_ids: { type: "array", items: { type: "string" }, description: "Listing ids to show as cards." },
      alternatives: { type: "boolean", description: "True when the cards are close alternatives, not exact matches." },
      follow_up_question: { type: "string", description: "Optional single clarifying question." },
    },
    required: ["message", "property_ids", "alternatives"],
    additionalProperties: false,
  },
};

/** History must start with a user turn; consecutive same-role turns are merged by the API. */
function toMessages(input: ProviderInput): MessageParam[] {
  const history = [...input.history];
  while (history.length > 0 && history[0]!.role !== "user") history.shift();
  return [...history.map((turn) => ({ role: turn.role, content: turn.content })), { role: "user", content: input.message }];
}

function serialise(content: unknown): string {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)} …(truncated)` : text;
}

export type AnthropicProviderOptions = {
  apiKey: string;
  model?: string | null;
  /** For tests: a pre-built client. */
  client?: Pick<Anthropic, "beta">;
};

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly client: Pick<Anthropic, "beta">;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model?.trim() || DEFAULT_ANTHROPIC_MODEL;
    this.client =
      options.client ?? new Anthropic({ apiKey: options.apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  }

  async respond(input: ProviderInput): Promise<ProviderResult> {
    const messages = toMessages(input);
    const tools = [...input.tools.definitions, PRESENT_RESULTS_DEFINITION].map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));
    const fallback = FALLBACK_MODELS.has(this.model);
    const result: ProviderResult = {
      outcome: "incomplete",
      present: null,
      text: null,
      model: this.model,
      input_tokens: 0,
      output_tokens: 0,
      tool_calls: 0,
    };

    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        // Stable prefix (tools + system) so repeated turns hit the prompt cache.
        system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
        tools,
        tool_choice: { type: "auto" },
        messages,
        output_config: { effort: "medium" },
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });

      result.model = response.model || this.model;
      result.input_tokens +=
        (response.usage.input_tokens ?? 0) +
        (response.usage.cache_read_input_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0);
      result.output_tokens += response.usage.output_tokens ?? 0;

      if (response.stop_reason === "refusal") return { ...result, outcome: "refusal" };

      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n")
        .trim();
      const toolUses = response.content.filter((block) => block.type === "tool_use");
      // Append the full content (thinking blocks included) so the loop stays append-only.
      messages.push({ role: "assistant", content: response.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });

      const final = toolUses.find((block) => block.name === PRESENT_RESULTS_TOOL);
      if (final) {
        const parsed = presentResultsSchema.safeParse(final.input);
        if (parsed.success) return { ...result, outcome: "presented", present: parsed.data, text: text || null };
      }

      if (toolUses.length === 0 || response.stop_reason === "max_tokens") {
        return { ...result, outcome: text ? "text" : "incomplete", text: text || null };
      }

      // Run every tool call of this step, answer them all in one user message.
      const outcomes: ToolResultParam[] = await Promise.all(
        toolUses.map(async (block): Promise<ToolResultParam> => {
          if (block.name === PRESENT_RESULTS_TOOL) {
            return {
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: "Invalid present_results input: message (string), property_ids (string[]) and alternatives (boolean) are required.",
            };
          }
          result.tool_calls += 1;
          const outcome = await input.tools.run(block.name, block.input);
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: serialise(outcome.content),
            ...(outcome.is_error ? { is_error: true } : {}),
          };
        }),
      );
      messages.push({ role: "user", content: outcomes });
    }
    return result;
  }
}

/** Anthropic SDK errors -> a stable code for ai_usage_logs.error_code (no messages, no secrets). */
export function anthropicErrorCode(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return "provider_rate_limited";
  if (error instanceof Anthropic.AuthenticationError) return "provider_auth";
  if (error instanceof Anthropic.PermissionDeniedError) return "provider_permission";
  if (error instanceof Anthropic.BadRequestError) return "provider_bad_request";
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "provider_timeout";
  if (error instanceof Anthropic.APIConnectionError) return "provider_connection";
  if (error instanceof Anthropic.APIError) return `provider_${error.status ?? "error"}`;
  return "internal";
}
