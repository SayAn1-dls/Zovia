#!/usr/bin/env node
/**
 * Imports REAL places from OpenStreetMap into public.osm_places (spec 14.3).
 *
 *   node scripts/import-osm.mjs                 # every active city
 *   node scripts/import-osm.mjs bengaluru pune  # selected cities
 *
 * Source: Nominatim (nominatim.openstreetmap.org) special-phrase search, e.g. "hostel in Pune".
 * Follows the Nominatim usage policy: identifies itself, max 1 request per second, one-off bulk
 * runs only (run it when you add cities, not on a schedule). Data © OpenStreetMap contributors,
 * ODbL. Nothing is invented: only what OSM contributors recorded (name, address, phone, website).
 * The gender hint is derived from the NAME only ("Ladies Hostel" -> female) and labelled so.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local).
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
    }
  } catch {
    /* env from the shell */
  }
}
loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const UA = "ZUVIO/0.1 (student housing discovery; one-off import)";

const HOUSING_PHRASES = [
  "hostel in", "paying guest in", "PG in", "ladies hostel in", "girls hostel in", "boys hostel in",
  "working women hostel in", "guest house in",
];
const POI_PHRASES = [
  ["college in", "college"], ["university in", "university"], ["metro station in", "metro_station"],
  ["railway station in", "railway_station"], ["bus station in", "bus_stop"], ["hospital in", "hospital"],
  ["pharmacy in", "pharmacy"], ["supermarket in", "grocery"], ["cafe in", "cafe"], ["restaurant in", "restaurant"],
  ["gym in", "gym"], ["mall in", "shopping_centre"],
];

const NOT_LONG_STAY = /backpacker|zostel|hotel|resort|holiday home|rest house|circuit house|dharamshala|club|homestay|airbnb|oyo\b|lodge|\binn\b|guest ?house of|government/i;
const PG = /(^|[^a-z])(pg|p\.g\.?)([^a-z]|$)|paying guest|co-?living/i;
const FEMALE = /ladies|girls|women|womens|female|mahila/i;
const MALE = /\bboys?\b|\bgents\b|\bmen'?s\b|\bmale\b/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function nominatim(q) {
  const wait = 1100 - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const params = new URLSearchParams({ q, format: "jsonv2", limit: "40", countrycodes: "in", extratags: "1", addressdetails: "1" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "User-Agent": UA, "Accept-Language": "en" },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return [];
      return await res.json();
    } catch (error) {
      await sleep(5000 * (attempt + 1));
      if (attempt === 2) console.warn(`  skip "${q}": ${error.message}`);
    }
  }
  return [];
}

function address(a = {}) {
  const parts = [a.house_number, a.road, a.neighbourhood ?? a.suburb, a.city_district].filter(Boolean);
  return parts.length ? parts.join(", ").slice(0, 300) : null;
}
function cleanUrl(value) {
  if (!value) return null;
  try {
    const u = new URL(value.startsWith("http") ? value : `https://${value}`);
    return ["http:", "https:"].includes(u.protocol) ? u.toString().slice(0, 300) : null;
  } catch {
    return null;
  }
}
function distanceKm(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRow(hit, city, category, kind) {
  const name = hit.name?.trim();
  if (!name || !hit.osm_type || !hit.osm_id) return null;
  const point = { lat: Number(hit.lat), lng: Number(hit.lon) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  if (distanceKm(point, city) > 35) return null; // a namesake in another city
  const tags = hit.extratags ?? {};
  let finalKind = kind;
  let gender = null;
  if (category === "housing") {
    if (NOT_LONG_STAY.test(name) && !PG.test(name)) return null;
    finalKind = PG.test(name) ? "pg" : hit.type === "guest_house" ? "guest_house" : /dorm/i.test(name) ? "dormitory" : "hostel";
    if (!["hostel", "guest_house", "apartments", "dormitory", "house", "yes", "residential", "building"].includes(hit.type) && !PG.test(name) && !/hostel/i.test(name)) return null;
    gender = FEMALE.test(name) ? "female" : MALE.test(name) ? "male" : null;
  }
  return {
    id: `osm:${hit.osm_type}/${hit.osm_id}`,
    category,
    kind: finalKind,
    name: name.slice(0, 200),
    city_slug: city.slug,
    location: `SRID=4326;POINT(${point.lng} ${point.lat})`,
    address: address(hit.address),
    phone: (tags["contact:phone"] ?? tags.phone)?.split(";")[0]?.trim().slice(0, 40) || null,
    website: cleanUrl(tags["contact:website"] ?? tags.website),
    gender_hint: gender,
    source_url: `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}`,
  };
}

async function main() {
  const only = process.argv.slice(2);
  // PostgREST returns geography as hex EWKB: 0101000020E6100000 + lng (float64 LE) + lat.
  const res = await db.from("cities").select("slug, name, location").eq("is_active", true).order("name");
  if (res.error) throw res.error;
  const f = (hex) => Buffer.from(hex, "hex").readDoubleLE(0);
  let list = res.data
    .map((c) => {
      const m = typeof c.location === "string" && c.location.match(/^0101000020E6100000([0-9A-F]{16})([0-9A-F]{16})$/i);
      return m ? { slug: c.slug, name: c.name, lng: f(m[1]), lat: f(m[2]) } : null;
    })
    .filter(Boolean);
  if (only.length) list = list.filter((c) => only.includes(c.slug));
  console.log(`Importing ${list.length} cities from OpenStreetMap (Nominatim)…`);
  for (const city of list) {
    const rows = new Map();
    for (const phrase of HOUSING_PHRASES) {
      for (const hit of await nominatim(`${phrase} ${city.name}`)) {
        const row = toRow(hit, city, "housing", "hostel");
        if (row && !rows.has(row.id)) rows.set(row.id, row);
      }
    }
    for (const [phrase, kind] of POI_PHRASES) {
      for (const hit of await nominatim(`${phrase} ${city.name}`)) {
        const row = toRow(hit, city, "poi", kind);
        if (row && !rows.has(row.id)) rows.set(row.id, row);
      }
    }
    const values = [...rows.values()];
    if (values.length) {
      const { error: upsertError } = await db.from("osm_places").upsert(values, { onConflict: "id" });
      if (upsertError) console.warn(`  ${city.slug}: ${upsertError.message}`);
    }
    const housing = values.filter((v) => v.category === "housing").length;
    console.log(`  ${city.name}: ${housing} hostels/PGs, ${values.length - housing} nearby places`);
  }
  console.log("Done. Data © OpenStreetMap contributors (ODbL).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
