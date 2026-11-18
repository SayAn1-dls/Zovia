import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/server/env";

/**
 * The Places photo proxy is paid per request, so it only serves photo names this server handed out.
 * Each name is signed with an HMAC keyed by the Google key itself (server-only, and present exactly
 * when the feature is on), so no extra secret is needed and a guessed or scraped name is useless
 * without its signature.
 */
export function signPhotoName(name: string, key: string): string {
  return createHmac("sha256", key).update(`google-photo:${name}`).digest("hex").slice(0, 32);
}

export function verifyPhotoSignature(name: string, signature: string | undefined, key: string): boolean {
  if (!signature || !/^[a-f0-9]{32}$/.test(signature)) return false;
  const expected = Buffer.from(signPhotoName(name, key));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Signature for a photo name this server is about to render, or undefined when Google is not configured. */
export function signedPhotoSignature(name: string): string | undefined {
  const key = env().GOOGLE_MAPS_API_KEY;
  return key ? signPhotoName(name, key) : undefined;
}
