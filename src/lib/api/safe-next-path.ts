/**
 * Validates a post-sign-in redirect target ("next" parameter). Isomorphic and dependency-free.
 *
 * Accepts only same-origin relative paths: a single leading "/", then anything that still
 * resolves to this origin. Rejected (the fallback is returned instead):
 *   absolute and scheme URLs (https://evil.com, javascript:...), protocol-relative URLs
 *   (//evil.com), backslash tricks browsers normalise to "//" (/\evil.com, \/evil.com), control
 *   characters and whitespace that URL parsers strip (/\t/evil.com), and percent-encoded forms of
 *   any of those (/%2F%2Fevil.com, /%5Cevil.com, double-encoded too).
 */
const INTERNAL_ORIGIN = "http://zuvio.internal";
const MAX_LENGTH = 2048;

/** C0 controls, space, DEL, and the Unicode spaces / separators URL parsers trim or drop. */
const EXTRA_SPACES = new Set([0x85, 0xa0, 0x2028, 0x2029, 0xfeff]);
function hasControlOrSpace(value: string, allowPlainSpace: boolean): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x20 && allowPlainSpace) continue;
    if (code <= 0x20 || code === 0x7f || EXTRA_SPACES.has(code)) return true;
  }
  return false;
}

/**
 * @param decoded true when judging a percent-decoded form. There an ordinary space is harmless
 *   (it came from "%20", which URL parsers keep as "%20", e.g. "/search?q=a%20b"); every other
 *   control or space is still refused, since tab/newline are stripped and could forge "//".
 */
function hasUnsafeShape(path: string, decoded = false): boolean {
  if (!path.startsWith("/")) return true;
  if (path.startsWith("//")) return true;
  if (path.includes("\\")) return true;
  // C0 controls, DEL, and any whitespace (URL parsers drop tab/newline, trim spaces).
  if (hasControlOrSpace(path, decoded)) return true;
  return false;
}

export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return fallback;
  if (hasUnsafeShape(value)) return fallback;

  // Decode repeatedly (bounded) so encoded and double-encoded tricks are judged in plain form.
  let decoded = value;
  for (let round = 0; round < 3; round += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return fallback; // malformed escape sequence
    }
    if (next === decoded) break;
    decoded = next;
    if (hasUnsafeShape(decoded, true)) return fallback;
  }

  let url: URL;
  try {
    url = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== INTERNAL_ORIGIN || url.username || url.password) return fallback;
  if (url.pathname.startsWith("//")) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
