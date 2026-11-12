import "server-only";

/**
 * Tiny structured logger: one JSON object per line on stdout/stderr
 * ({ level, msg, time, request_id?, ...fields }), which Vercel and most log stores index as-is.
 *
 * Redaction is defence in depth, not a licence to log personal data: callers must not pass
 * request bodies, tokens, e-mail addresses or phone numbers in the first place.
 *  - values of sensitive-looking keys are replaced with "[redacted]"
 *  - e-mail addresses, JWTs, Supabase/API keys and long digit runs inside strings are masked
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const SENSITIVE_KEY =
  /pass(word|wd)?|secret|token|authorization|cookie|api[-_]?key|apikey|service[-_]?role|credential|session|otp|e[-_]?mail|phone|mobile|whatsapp|address|body|payload|date_of_birth|dob/i;

const REDACTED = "[redacted]";
const MAX_STRING = 2000;
const MAX_DEPTH = 5;

const PATTERNS: [RegExp, string][] = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, "[email]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[jwt]"],
  [/\b(?:sb_secret_|sb_publishable_|sk-|re_)[A-Za-z0-9_-]{8,}/g, "[key]"],
  [/(?<![\w-])\+?\d[\d ()-]{8,16}\d(?![\w-])/g, "[number]"],
];

export function redactString(value: string): string {
  let out = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return serializeError(value);
  if (typeof value !== "object") return undefined;
  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[truncated]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1, seen);
  }
  return out;
}

/** Name, redacted message, code/digest when present, and the stack outside production. */
export function serializeError(error: unknown): LogFields {
  if (!(error instanceof Error)) {
    if (error && typeof error === "object") {
      const { name, code, message } = error as Record<string, unknown>;
      return {
        name: typeof name === "string" ? name : "NonError",
        ...(typeof code === "string" ? { code } : {}),
        message: typeof message === "string" ? redactString(message) : undefined,
      };
    }
    return { name: "NonError", message: redactString(String(error)) };
  }
  const extra = error as Error & { code?: unknown; digest?: unknown };
  return {
    name: error.name,
    message: redactString(error.message),
    ...(typeof extra.code === "string" ? { code: extra.code } : {}),
    ...(typeof extra.digest === "string" ? { digest: extra.digest } : {}),
    ...(process.env.NODE_ENV !== "production" && error.stack
      ? { stack: redactString(error.stack) }
      : {}),
  };
}

export type Logger = {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** A logger that adds `bound` (for example { request_id }) to every line. */
  child(bound: LogFields): Logger;
};

function write(level: LogLevel, msg: string, bound: LogFields, fields?: LogFields): void {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...(redact({ ...bound, ...fields }) as LogFields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function create(bound: LogFields): Logger {
  return {
    debug: (msg, fields) => write("debug", msg, bound, fields),
    info: (msg, fields) => write("info", msg, bound, fields),
    warn: (msg, fields) => write("warn", msg, bound, fields),
    error: (msg, fields) => write("error", msg, bound, fields),
    child: (more) => create({ ...bound, ...more }),
  };
}

export const logger: Logger = create({});
