import "server-only";

import { revalidateTag, updateTag } from "next/cache";

import { PROPERTY_CACHE_TAGS } from "@/features/properties/schemas";

/**
 * Expires the cached public search and property detail after a listing changes, so owners and
 * staff see their own change straight away. `updateTag` (read-your-own-writes) only works inside
 * Server Actions; from a Route Handler we fall back to `revalidateTag(tag, { expire: 0 })`.
 */
export function invalidateListingCache(slug: string | null): void {
  const tags: string[] = [PROPERTY_CACHE_TAGS.all];
  if (slug) tags.push(PROPERTY_CACHE_TAGS.detail(slug));
  for (const tag of tags) {
    try {
      updateTag(tag);
    } catch {
      revalidateTag(tag, { expire: 0 });
    }
  }
}
