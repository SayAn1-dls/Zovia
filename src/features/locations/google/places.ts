import { GOOGLE_PHOTO_NAME, type GooglePlace } from "../schemas";

/**
 * Google Places API (New): Text Search for the "PGs and hostels on Google Maps" discovery section
 * (spec 14.3) and Place Photos. Results are fetched live per request and never stored (Google's
 * terms allow keeping only place ids). The API key is server-only: it is sent from the server to
 * Google and never reaches the browser; photos are proxied through our own route.
 */

export const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.photos",
].join(",");

export function buildTextSearchBody(cityName: string, pageSize = 9) {
  return {
    textQuery: `PG and hostels in ${cityName}`,
    regionCode: "IN",
    languageCode: "en",
    pageSize,
  };
}

type RawPhoto = { name?: unknown; authorAttributions?: unknown };
type RawPlace = {
  id?: unknown;
  displayName?: { text?: unknown };
  formattedAddress?: unknown;
  rating?: unknown;
  userRatingCount?: unknown;
  googleMapsUri?: unknown;
  photos?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function httpsUrl(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  try {
    const url = new URL(text.startsWith("//") ? `https:${text}` : text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Places Text Search JSON -> our discovery cards. Places without an id or name are dropped. */
export function parseTextSearchResponse(json: unknown): GooglePlace[] {
  const places = (json as { places?: unknown } | null)?.places;
  if (places === undefined) return [];
  if (!Array.isArray(places)) throw new Error("Places response has no places array.");
  const out: GooglePlace[] = [];
  for (const raw of places as RawPlace[]) {
    const placeId = asString(raw?.id);
    const name = asString(raw?.displayName?.text);
    if (!placeId || !name) continue;
    const photos = Array.isArray(raw.photos) ? (raw.photos as RawPhoto[]) : [];
    const photo = photos.find((p) => typeof p?.name === "string" && GOOGLE_PHOTO_NAME.test(p.name));
    out.push({
      place_id: placeId,
      name,
      address: asString(raw.formattedAddress),
      rating: typeof raw.rating === "number" && Number.isFinite(raw.rating) ? raw.rating : null,
      rating_count:
        typeof raw.userRatingCount === "number" && Number.isFinite(raw.userRatingCount) ? raw.userRatingCount : null,
      maps_url: httpsUrl(raw.googleMapsUri),
      photo: photo
        ? {
            name: photo.name as string,
            attributions: (Array.isArray(photo.authorAttributions) ? photo.authorAttributions : [])
              .map((a: { displayName?: unknown; uri?: unknown }) => ({
                name: asString(a?.displayName) ?? "",
                uri: httpsUrl(a?.uri),
              }))
              .filter((a) => a.name !== ""),
          }
        : null,
    });
  }
  return out;
}

export async function textSearch(
  cityName: string,
  options: { apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<GooglePlace[]> {
  const response = await (options.fetchImpl ?? fetch)(PLACES_TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": options.apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(buildTextSearchBody(cityName)),
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Places Text Search answered ${response.status}`);
  return parseTextSearchResponse(await response.json());
}

/**
 * Photo bytes for a Places photo resource name. Asks Places for the short-lived photo URI
 * (skipHttpRedirect) and downloads it server-side, so the key is never exposed.
 */
export async function fetchPhoto(
  name: string,
  options: { apiKey: string; maxWidthPx?: number; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<{ body: ArrayBuffer; contentType: string }> {
  if (!GOOGLE_PHOTO_NAME.test(name)) throw new Error("Invalid photo name.");
  const doFetch = options.fetchImpl ?? fetch;
  const url = new URL(`https://places.googleapis.com/v1/${name}/media`);
  url.searchParams.set("maxWidthPx", String(options.maxWidthPx ?? 800));
  url.searchParams.set("skipHttpRedirect", "true");
  const meta = await doFetch(url, {
    headers: { "X-Goog-Api-Key": options.apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    cache: "no-store",
  });
  if (!meta.ok) throw new Error(`Place Photos answered ${meta.status}`);
  const photoUri = httpsUrl(((await meta.json()) as { photoUri?: unknown }).photoUri);
  if (!photoUri) throw new Error("Place Photos returned no photo URI.");
  const image = await doFetch(photoUri, { signal: AbortSignal.timeout(options.timeoutMs ?? 10_000), cache: "no-store" });
  const contentType = image.headers.get("content-type") ?? "";
  if (!image.ok || !/^image\/(jpeg|png|webp)$/i.test(contentType.split(";")[0]?.trim() ?? "")) {
    throw new Error(`Photo download failed (${image.status}, ${contentType || "no type"})`);
  }
  return { body: await image.arrayBuffer(), contentType: contentType.split(";")[0]!.trim() };
}
