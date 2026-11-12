import "server-only";

import { z } from "zod";

import { PAGINATION, type CursorMeta, type PageMeta } from "@/lib/constants";

/**
 * Query-string schema for page/limit pagination. Spread into a handler's query schema:
 *   query: z.object({ ...paginationShape, city: z.string().optional() })
 * Out-of-range values are rejected (422) rather than silently clamped.
 */
export const paginationShape = {
  page: z.coerce.number().int().min(1).max(PAGINATION.maxPage).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
};
export const paginationSchema = z.object(paginationShape);
export type Pagination = z.infer<typeof paginationSchema>;

/** A pagination schema with a different cap/default for one endpoint. */
export function paginationWith(options: { defaultLimit?: number; maxLimit?: number }) {
  const max = options.maxLimit ?? PAGINATION.maxLimit;
  const def = Math.min(options.defaultLimit ?? PAGINATION.defaultLimit, max);
  return {
    page: paginationShape.page,
    limit: z.coerce.number().int().min(1).max(max).default(def),
  };
}

/** Clamps untrusted numbers (for Server Components reading searchParams by hand). */
export function clampPagination(input: { page?: unknown; limit?: unknown }): Pagination {
  const page = Number.parseInt(String(input.page ?? ""), 10);
  const limit = Number.parseInt(String(input.limit ?? ""), 10);
  return {
    page: Number.isFinite(page) ? Math.min(Math.max(page, 1), PAGINATION.maxPage) : 1,
    limit: Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), PAGINATION.maxLimit)
      : PAGINATION.defaultLimit,
  };
}

/** Inclusive row range for PostgREST `.range(from, to)`, plus offset for SQL functions. */
export function toRange({ page, limit }: Pagination): { from: number; to: number; offset: number } {
  const from = (page - 1) * limit;
  return { from, to: from + limit - 1, offset: from };
}

/** `meta` for a page of results. `total` is the full count for the query. */
export function pageMeta({ page, limit }: Pagination, total: number): PageMeta {
  const safeTotal = Math.max(0, Math.trunc(total));
  return { page, limit, total: safeTotal, has_more: page * limit < safeTotal };
}

/** `meta` for keyset pagination. */
export function cursorMeta(nextCursor: string | null | undefined): CursorMeta {
  return { next_cursor: nextCursor ?? null };
}

/** Opaque cursor helpers (base64url JSON). `decodeCursor` returns null for anything malformed. */
export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T>(cursor: string | null | undefined, schema: z.ZodType<T>): T | null {
  if (!cursor || cursor.length > 1024) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
