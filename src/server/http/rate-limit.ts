import "server-only";

import { createHash } from "node:crypto";

import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

/**
 * Rate limiting behind one interface with three implementations, chosen at runtime:
 *   1. Upstash Redis (sliding window)   when UPSTASH_REDIS_REST_URL + _TOKEN are set
 *   2. Postgres `check_rate_limit()`    when the service-role client is available (fixed window)
 *   3. per-instance memory              otherwise (sliding window; best effort: each server
 *                                       instance counts on its own, and counts reset on restart)
 * If the selected backend fails at request time the call falls back to the memory limiter and
 * the failure is logged; a broken limiter must not take the API down, and must not wave
 * everything through either.
 *
 * This is the outer, per-route throttle. Security-relevant caps (messages per minute, contact
 * messages per address, swipes ...) are additionally enforced inside the SQL functions.
 */

export type RateLimitRule = {
  /** Requests allowed per window. */
  max: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  /** Requests left in the window; null when the backend does not report it (Postgres). */
  remaining: number | null;
  /** Seconds until a retry can succeed (an upper bound for the Postgres backend). */
  retryAfterSeconds: number;
};

export interface RateLimiter {
  readonly kind: "upstash" | "postgres" | "memory";
  limit(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
}

/** Named presets. Keys are per user when signed in, otherwise per client IP, plus the route label. */
export const RATE_LIMITS = {
  /** Sign-in, sign-up, password reset, OTP requests. */
  auth: { max: 10, windowSeconds: 600 },
  /** Public contact form (the SQL function also caps per e-mail address and globally). */
  contact: { max: 5, windowSeconds: 3600 },
  /** Search, autocomplete and other read endpoints that hit the database or a provider. */
  search: { max: 60, windowSeconds: 60 },
  /** Ordinary writes (save, profile edits, enquiries, reports). */
  mutation: { max: 30, windowSeconds: 60 },
  /** AI assistant turns. */
  assistant: { max: 20, windowSeconds: 3600 },
  /** Upload preparation (signed URLs, media rows). */
  upload: { max: 30, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitPreset = keyof typeof RATE_LIMITS;

export function resolveRule(rule: RateLimitPreset | RateLimitRule): RateLimitRule {
  return typeof rule === "string" ? RATE_LIMITS[rule] : rule;
}

// ───────────────────────────── memory ─────────────────────────────

const MAX_TRACKED_KEYS = 10_000;

/** Sliding-window log limiter. Exported for tests; production code uses `getRateLimiter()`. */
export class MemoryRateLimiter implements RateLimiter {
  readonly kind = "memory" as const;
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  async limit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = this.now();
    const windowMs = rule.windowSeconds * 1000;
    const id = `${key}|${rule.max}|${rule.windowSeconds}`;
    const recent = (this.hits.get(id) ?? []).filter((time) => time > now - windowMs);

    if (recent.length >= rule.max) {
      this.hits.set(id, recent);
      const oldest = recent[0] ?? now;
      return {
        allowed: false,
        limit: rule.max,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      };
    }

    recent.push(now);
    this.hits.delete(id); // re-insert so Map order is "least recently used first"
    this.hits.set(id, recent);
    if (this.hits.size > MAX_TRACKED_KEYS) this.evict();
    return { allowed: true, limit: rule.max, remaining: rule.max - recent.length, retryAfterSeconds: 0 };
  }

  /** Drops the least recently used tenth so memory stays bounded under a flood of keys. */
  private evict(): void {
    let toDrop = Math.ceil(MAX_TRACKED_KEYS / 10);
    for (const key of this.hits.keys()) {
      if (toDrop-- <= 0) break;
      this.hits.delete(key);
    }
  }

  get size(): number {
    return this.hits.size;
  }
}

// ───────────────────────────── postgres ─────────────────────────────

class PostgresRateLimiter implements RateLimiter {
  readonly kind = "postgres" as const;

  async limit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const admin = createSupabaseAdminClient();
    if (!admin) throw new Error("service-role client is not configured");
    // check_rate_limit keys are capped at 200 characters; ours are short, but hash to be safe.
    const safeKey = key.length <= 180 ? key : `h:${createHash("sha256").update(key).digest("hex")}`;
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: `${safeKey}:${rule.windowSeconds}`,
      p_max: rule.max,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) throw error;
    const allowed = data === true;
    return {
      allowed,
      limit: rule.max,
      remaining: null,
      retryAfterSeconds: allowed ? 0 : rule.windowSeconds,
    };
  }
}

// ───────────────────────────── upstash ─────────────────────────────

class UpstashRateLimiter implements RateLimiter {
  readonly kind = "upstash" as const;
  private readonly limiters = new Map<string, Promise<{ limit(key: string): Promise<UpstashResponse> }>>();

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private forRule(rule: RateLimitRule) {
    const id = `${rule.max}/${rule.windowSeconds}`;
    let limiter = this.limiters.get(id);
    if (!limiter) {
      limiter = (async () => {
        // Loaded on demand so deployments without Redis never evaluate these packages.
        const [{ Ratelimit }, { Redis }] = await Promise.all([
          import("@upstash/ratelimit"),
          import("@upstash/redis"),
        ]);
        return new Ratelimit({
          redis: new Redis({ url: this.url, token: this.token }),
          limiter: Ratelimit.slidingWindow(rule.max, `${rule.windowSeconds} s`),
          prefix: "zuvio:rl",
          analytics: false,
        });
      })();
      this.limiters.set(id, limiter);
    }
    return limiter;
  }

  async limit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const limiter = await this.forRule(rule);
    const result = await limiter.limit(key);
    return {
      allowed: result.success,
      limit: result.limit,
      remaining: Math.max(0, result.remaining),
      retryAfterSeconds: result.success ? 0 : Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    };
  }
}

type UpstashResponse = { success: boolean; limit: number; remaining: number; reset: number };

// ───────────────────────────── selection ─────────────────────────────

const memoryFallback = new MemoryRateLimiter();
let selected: RateLimiter | undefined;

function select(): RateLimiter {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, SUPABASE_SERVICE_ROLE_KEY } = env();
  if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashRateLimiter(UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN);
  }
  if (SUPABASE_SERVICE_ROLE_KEY) return new PostgresRateLimiter();
  logger.warn("rate_limit.memory_backend", {
    detail:
      "Neither Upstash Redis nor the service-role key is configured: rate limits are per server instance and best effort.",
  });
  return memoryFallback;
}

/** The limiter for this deployment, with fallback to memory when the backend errors. */
export function getRateLimiter(): RateLimiter {
  selected ??= select();
  const primary = selected;
  if (primary.kind === "memory") return primary;
  return {
    kind: primary.kind,
    async limit(key, rule) {
      try {
        return await primary.limit(key, rule);
      } catch (error) {
        logger.error("rate_limit.backend_failed", { backend: primary.kind, error });
        return memoryFallback.limit(key, rule);
      }
    },
  };
}

/** Test hook. */
export function resetRateLimiter(): void {
  selected = undefined;
}

// ───────────────────────────── keys ─────────────────────────────

/**
 * Client IP for rate-limit keys.
 *
 * Trust model: on Vercel the edge network overwrites `x-forwarded-for` (and sets `x-real-ip`)
 * with the address of the TCP peer it accepted, and does not forward a client-supplied value,
 * so the visitor cannot choose it. `x-vercel-forwarded-for` is the same value and survives an
 * additional proxy in front of Vercel. We therefore read, in order: x-vercel-forwarded-for,
 * x-real-ip, then the FIRST entry of x-forwarded-for.
 *
 * Off Vercel (`next start` behind your own proxy) these headers are only as trustworthy as that
 * proxy: it must overwrite them. With no proxy at all Next.js fills x-forwarded-for from the
 * socket only when the client did not send one, so a direct client can spoof it; that is
 * acceptable for local development only.
 */
export function clientIp(headers: Headers): string | null {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for"),
  ];
  for (const value of candidates) {
    const first = value?.split(",")[0]?.trim();
    if (first && first.length <= 64 && /^[0-9a-fA-F:.]+$/.test(first)) return first;
  }
  return null;
}

/**
 * Key for one caller on one route: the user id when signed in, otherwise a truncated SHA-256 of
 * the IP (so raw addresses are not stored in Redis / Postgres), prefixed with the route label.
 * Callers with no usable IP share one bucket per route.
 */
export function rateLimitKey(label: string, subject: { userId?: string | null; ip?: string | null }): string {
  if (subject.userId) return `${label}:u:${subject.userId}`;
  if (subject.ip) {
    return `${label}:ip:${createHash("sha256").update(subject.ip).digest("hex").slice(0, 32)}`;
  }
  return `${label}:ip:unknown`;
}
