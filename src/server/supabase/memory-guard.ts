/**
 * The memory backend is a single-process demo store. On a real hosted deployment (Vercel sets
 * VERCEL) it would silently lose data between invocations and ignore the shared database, so it
 * refuses to run there unless ALLOW_MEMORY_IN_PRODUCTION=1 is set on purpose. Local `next start`
 * (no VERCEL) is unaffected.
 */
export function isHostedDeployment(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.VERCEL);
}

export function assertMemoryBackendAllowed(env: Record<string, string | undefined> = process.env): void {
  if (isHostedDeployment(env) && env.ALLOW_MEMORY_IN_PRODUCTION !== "1") {
    throw new Error(
      "Zovia is running on a hosted deployment without Supabase configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY (and rebuild), or set ALLOW_MEMORY_IN_PRODUCTION=1 to run the demo " +
        "memory store on purpose.",
    );
  }
}

/** The memory backend never auto-grants admin on a hosted deployment, even for allowlisted e-mails. */
export function memoryMayAutoGrantAdmin(env: Record<string, string | undefined> = process.env): boolean {
  return !isHostedDeployment(env);
}
