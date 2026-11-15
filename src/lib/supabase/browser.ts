import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

import { authCookieOptions, usesSupabase } from "./backend";
import { publicEnv } from "./public-env";

/**
 * Browser Supabase client (singleton): auth state, Realtime and Storage only. Uses the real
 * Supabase project when configured, otherwise an in-memory shim for local demos.
 * All data reads and writes go through server code (`/api/v1` via `apiFetch`, or Server Actions).
 */
let client: SupabaseClient<Database> | undefined;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(blob);
  });
}

function createMemoryBrowserClient(): SupabaseClient<Database> {
  const memoryFiles = new Map<string, string>();

  const makeChannel = () => {
    const ch = {
      on() {
        return ch;
      },
      subscribe(cb?: (status: string) => void) {
        if (cb) setTimeout(() => cb("SUBSCRIBED"), 0);
        return ch;
      },
      async send() {
        return "ok";
      },
      async unsubscribe() {
        return "ok";
      },
    };
    return ch;
  };

  const shim = {
    auth: {
      onAuthStateChange() {
        return {
          data: {
            subscription: {
              unsubscribe() {},
            },
          },
        };
      },
      async signOut() {
        return { error: null };
      },
    },
    channel() {
      return makeChannel();
    },
    removeChannel() {
      return Promise.resolve("ok");
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, body: Blob) {
            try {
              const dataUrl = await blobToDataUrl(body);
              memoryFiles.set(`${bucket}/${path}`, dataUrl);
            } catch {
              // ignore
            }
            return { data: { path }, error: null };
          },
          async remove(paths: string[]) {
            for (const p of paths) memoryFiles.delete(`${bucket}/${p}`);
            return { data: paths.map((name) => ({ name })), error: null };
          },
          getPublicUrl(path: string) {
            return {
              data: {
                publicUrl:
                  memoryFiles.get(`${bucket}/${path}`) ??
                  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80",
              },
            };
          },
        };
      },
    },
  };

  return shim as unknown as SupabaseClient<Database>;
}

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (typeof window === "undefined") {
    throw new Error("getSupabaseBrowserClient() was called on the server. Use it in effects or event handlers.");
  }
  client ??= usesSupabase()
    ? createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, { cookieOptions: authCookieOptions() })
    : createMemoryBrowserClient();
  return client;
}
