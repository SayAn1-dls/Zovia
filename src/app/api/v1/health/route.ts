import packageJson from "../../../../../package.json";

import { EnvError, integrationStatus } from "@/server/env";
import { createHandler, ok } from "@/server/http";
import { logger, serializeError } from "@/server/logger";
import { createSupabasePublicClient } from "@/server/supabase/public";

type DatabaseCheck = { ok: boolean; latency_ms: number | null };

const DATABASE_TIMEOUT_MS = 3000;

/**
 * Database reachability measured with a trivial public call: `is_staff()` is granted to `anon`,
 * touches no table for an anonymous caller and returns false. It goes through the same gateway,
 * PostgREST and Postgres path as every other query.
 */
async function checkDatabase(): Promise<DatabaseCheck> {
  const started = performance.now();
  try {
    const { data, error } = await createSupabasePublicClient()
      .rpc("is_staff")
      .abortSignal(AbortSignal.timeout(DATABASE_TIMEOUT_MS));
    if (error) throw error;
    return { ok: data === false, latency_ms: Math.round(performance.now() - started) };
  } catch (error) {
    logger.error("health.database_unreachable", { error: serializeError(error) });
    return { ok: false, latency_ms: null };
  }
}

/**
 * GET /api/v1/health: 200 when the app and the database are fine, 503 otherwise (the envelope is
 * still `ok: true` with `status: "degraded"` so monitors can read the detail). Reports which
 * optional integrations are configured as booleans and mode labels only; never any value.
 */
export const GET = createHandler({ auth: "public", rateLimit: false, label: "health" }, async () => {
  let integrations: ReturnType<typeof integrationStatus> | null = null;
  let environment: { ok: boolean; invalid?: string[] } = { ok: true };
  try {
    integrations = integrationStatus();
  } catch (error) {
    environment = { ok: false, invalid: error instanceof EnvError ? error.variables : undefined };
  }

  const database = environment.ok ? await checkDatabase() : { ok: false, latency_ms: null };
  const healthy = environment.ok && database.ok;

  return ok(
    {
      status: healthy ? "ok" : "degraded",
      time: new Date().toISOString(),
      app: {
        version: packageJson.version,
        // Set by Vercel at build time; absent locally.
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
      },
      checks: { environment, database },
      integrations,
    },
    { status: healthy ? 200 : 503 },
  );
});
