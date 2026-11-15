/**
 * Which data backend this deployment uses (isomorphic: the variables are inlined into the browser
 * bundle at build time).
 *
 * - "supabase": Postgres + Auth + Storage + Realtime. Required in production: it is shared by every
 *   server instance behind the load balancer, so any number of instances can serve traffic.
 * - "memory": a single-process demo store (a JSON file on local disk). Used only when Supabase is
 *   not configured, or when NEXT_PUBLIC_DATA_BACKEND=memory is set on purpose. It does not scale
 *   past one server process and loses data on serverless platforms.
 */
export type DataBackend = "supabase" | "memory";

export function dataBackend(): DataBackend {
  if (process.env.NEXT_PUBLIC_DATA_BACKEND === "memory") return "memory";
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "supabase" : "memory";
}

export function usesSupabase(): boolean {
  return dataBackend() === "supabase";
}

/** Auth cookies get the Secure flag whenever the site is served over https (never sent over http). */
export function secureCookies(): boolean {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");
}

/** Options for every auth cookie: unreadable by scripts, same-site, https-only on a live site. */
export function authCookieOptions() {
  return { path: "/", sameSite: "lax" as const, secure: secureCookies() };
}
