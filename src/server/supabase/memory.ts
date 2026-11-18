import "server-only";

import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";

import { AuthApiError } from "@supabase/supabase-js";

import { CATALOG_CITIES } from "@/features/catalog/cities";
import { getCatalogListing } from "@/features/catalog/listings";
import { LIFESTYLE_QUESTIONS, type QuestionCode } from "@/features/roommates/compatibility/questions";

import { isDeveloperEmail } from "../auth/developer-access";
import { assertMemoryBackendAllowed, memoryMayAutoGrantAdmin } from "./memory-guard";
import type { AppSupabaseClient } from "./types";

export const MEMORY_SESSION_COOKIE = "zovia_session";
const MEMORY_STORE_FILE = "/tmp/zovia-memory-store-v1.json";

type Row = Record<string, unknown>;

interface AuthUserRecord {
  id: string;
  email: string;
  /** scrypt$<salt hex>$<hash hex>. Plain passwords are never stored. */
  passwordHash: string;
  /** Legacy plain-text field from older store files; hashed and removed on load. */
  password?: string;
  fullName: string;
  createdAt: string;
}

interface MemoryStore {
  version: number;
  updatedAt: number;
  authUsersById: Record<string, AuthUserRecord>;
  authUserIdByEmail: Record<string, string>;
  /** SHA-256 of the session token -> user and expiry. The raw token exists only in the cookie. */
  sessionsByToken: Record<string, string | { userId: string; expiresAt: number }>;
  tables: Record<string, Row[]>;
  storage: Record<string, Record<string, string>>; // bucket -> path -> url
}

declare global {
  var __zoviaMemoryStore: MemoryStore | undefined;
}

function table(store: MemoryStore, name: string): Row[] {
  let rows = store.tables[name];
  if (!rows) {
    rows = [];
    store.tables[name] = rows;
  }
  return rows;
}

const QUESTION_PROMPTS: Record<QuestionCode, string> = {
  food_habit: "What is your food preference?",
  kitchen_preference: "What is your kitchen preference?",
  smoking: "Do you smoke?",
  drinking: "Do you drink alcohol?",
  sleep_schedule: "When do you usually go to sleep?",
  cleanliness: "How tidy do you keep shared spaces?",
  social_level: "How social are you at home?",
  noise: "What noise level do you prefer at home?",
  pets: "How do you feel about pets?",
  cooking: "How often do you cook at home?",
  personal_space: "How do you view personal space and sharing?",
  chores: "How should household chores be handled?",
  rent_payment: "How do you handle rent and bill payments?",
  schedule: "What is your typical daily work or study schedule?",
  guests: "How often do you have friends or guests over?",
  overnight_guests: "How do you feel about overnight guests?",
};

function createInitialStore(): MemoryStore {
  const now = new Date().toISOString();
  const cities: Row[] = CATALOG_CITIES.map((city, idx) => ({
    id: `00000000-0000-4000-8000-${String(idx + 1).padStart(12, "0")}`,
    slug: city.slug,
    name: city.name,
    state: city.state,
    is_active: true,
    position: idx + 1,
    location: `POINT(${city.lng} ${city.lat})`,
    created_at: now,
  }));

  const amenityDefs = [
    { code: "wifi", label: "High-speed Wi-Fi", category: "connectivity", icon: "wifi" },
    { code: "ac", label: "Air conditioning", category: "comfort", icon: "snowflake" },
    { code: "attached_bathroom", label: "Attached washroom", category: "room", icon: "bath" },
    { code: "laundry", label: "Washing machine / Laundry", category: "utilities", icon: "shirt" },
    { code: "food", label: "Home-style meals", category: "food", icon: "utensils" },
    { code: "power_backup", label: "24x7 Power backup", category: "utilities", icon: "zap" },
    { code: "housekeeping", label: "Regular housekeeping", category: "services", icon: "sparkles" },
    { code: "geyser", label: "Hot water / Geyser", category: "utilities", icon: "flame" },
    { code: "parking", label: "Two/Four-wheeler parking", category: "facilities", icon: "car" },
    { code: "gym", label: "Fitness area / Gym", category: "facilities", icon: "dumbbell" },
    { code: "cctv", label: "24x7 CCTV & biometric entry", category: "security", icon: "shield" },
    { code: "study_table", label: "Study desk & chair", category: "room", icon: "Monitor" },
    { code: "fridge", label: "Refrigerator", category: "appliances", icon: "refrigerator" },
    { code: "ro_water", label: "RO drinking water", category: "utilities", icon: "droplet" },
  ];

  const amenities: Row[] = amenityDefs.map((item, idx) => ({
    id: `00000000-0000-4000-8001-${String(idx + 1).padStart(12, "0")}`,
    code: item.code,
    name: item.label,
    label: item.label,
    category: item.category,
    icon: item.icon,
    position: idx + 1,
  }));

  const lifestyleQuestions: Row[] = (Object.keys(LIFESTYLE_QUESTIONS) as QuestionCode[]).map((code, idx) => {
    const def = LIFESTYLE_QUESTIONS[code];
    const options = Object.entries(def.options).map(([val, label]) => ({
      value: Number(val),
      label,
    }));
    return {
      code,
      factor: def.factor,
      prompt: QUESTION_PROMPTS[code] ?? code,
      kind: def.kind,
      options,
      position: idx + 1,
      is_active: true,
    };
  });

  const compatibilityWeights: Row[] = [
    { factor: "budget", weight: 20 },
    { factor: "cleanliness", weight: 15 },
    { factor: "sleep", weight: 12 },
    { factor: "food", weight: 12 },
    { factor: "smoking_drinking", weight: 12 },
    { factor: "lifestyle", weight: 10 },
    { factor: "schedule", weight: 7 },
    { factor: "guests", weight: 6 },
    { factor: "location", weight: 6 },
  ];

  const sampleRoommates = [
    {
      id: "11111111-1111-4111-8111-111111111101",
      email: "aarav.sharma@example.com",
      name: "Aarav Sharma",
      headline: "Product Designer at a fintech startup looking for a chill flatmate",
      about: "I work hybrid 3 days a week, enjoy specialty coffee, weekend badminton, and keeping the living room clean and relaxed.",
      age: 24,
      gender: "male",
      occupation: "working_professional",
      occupation_detail: "Product Designer",
      city: "Bengaluru",
      preferred_localities: ["Koramangala", "HSR Layout", "Indiranagar"],
      budget_min: 11000,
      budget_max: 18000,
      move_in_date: "2026-12-01",
      has_place: true,
      place: {
        title: "Sunny 2BHK near Sony World Signal",
        description: "Fully furnished 2BHK with balcony, high-speed fiber Wi-Fi, and a cook who comes twice a day.",
        property_type: "flat",
        locality: "Koramangala",
        city: "Bengaluru",
        rent_share: 14500,
        deposit_share: 35000,
        vacancies: 1,
        available_from: "2026-12-01",
        furnishing: "fully_furnished",
      },
      answers: {
        food_habit: 2,
        kitchen_preference: 3,
        smoking: 1,
        drinking: 2,
        sleep_schedule: 3,
        cleanliness: 4,
        social_level: 3,
        noise: 2,
        pets: 2,
        cooking: 3,
        personal_space: 3,
        chores: 2,
        rent_payment: 1,
        schedule: 3,
        guests: 3,
        overnight_guests: 2,
      },
      deal_breakers: ["smoking", "late_rent"],
    },
    {
      id: "11111111-1111-4111-8111-111111111102",
      email: "ananya.verma@example.com",
      name: "Ananya Verma",
      headline: "Software Engineer looking for a peaceful PG or 2BHK share",
      about: "Clean, respectful of personal space, love board games and movie nights on Fridays. Vegetarian and early riser.",
      age: 23,
      gender: "female",
      occupation: "working_professional",
      occupation_detail: "Software Engineer",
      city: "Bengaluru",
      preferred_localities: ["Indiranagar", "HSR Layout", "Whitefield"],
      budget_min: 10000,
      budget_max: 16000,
      move_in_date: "2026-12-05",
      has_place: false,
      place: null,
      answers: {
        food_habit: 1,
        kitchen_preference: 2,
        smoking: 1,
        drinking: 1,
        sleep_schedule: 2,
        cleanliness: 5,
        social_level: 3,
        noise: 2,
        pets: 2,
        cooking: 4,
        personal_space: 3,
        chores: 2,
        rent_payment: 1,
        schedule: 1,
        guests: 2,
        overnight_guests: 2,
      },
      deal_breakers: ["smoking", "messy"],
    },
    {
      id: "11111111-1111-4111-8111-111111111103",
      email: "rohan.kulkarni@example.com",
      name: "Rohan Kulkarni",
      headline: "MBA Student & data analyst hunting for a roommate",
      about: "Easygoing, into fitness and running. Looking for someone tidy and punctual with bills.",
      age: 25,
      gender: "male",
      occupation: "student",
      occupation_detail: "MBA Candidate",
      city: "Pune",
      preferred_localities: ["Kothrud", "Viman Nagar", "Baner"],
      budget_min: 8000,
      budget_max: 14000,
      move_in_date: "2026-12-01",
      has_place: false,
      place: null,
      answers: {
        food_habit: 3,
        kitchen_preference: 3,
        smoking: 1,
        drinking: 2,
        sleep_schedule: 3,
        cleanliness: 4,
        social_level: 4,
        noise: 3,
        pets: 2,
        cooking: 3,
        personal_space: 3,
        chores: 2,
        rent_payment: 1,
        schedule: 1,
        guests: 3,
        overnight_guests: 2,
      },
      deal_breakers: ["late_rent"],
    },
    {
      id: "11111111-1111-4111-8111-111111111104",
      email: "meera.nair@example.com",
      name: "Meera Nair",
      headline: "UX Researcher seeking a friendly flatmate",
      about: "Love plants, weekend cafe hopping, and a calm home after work hours.",
      age: 26,
      gender: "female",
      occupation: "working_professional",
      occupation_detail: "UX Researcher",
      city: "Mumbai",
      preferred_localities: ["Andheri West", "Powai", "Bandra West"],
      budget_min: 14000,
      budget_max: 24000,
      move_in_date: "2026-12-10",
      has_place: true,
      place: {
        title: "Breezy 2BHK in Powai Hiranandani",
        description: "Private bedroom with attached bath in a gated complex with gym and pool access.",
        property_type: "flat",
        locality: "Powai",
        city: "Mumbai",
        rent_share: 18500,
        deposit_share: 50000,
        vacancies: 1,
        available_from: "2026-12-10",
        furnishing: "fully_furnished",
      },
      answers: {
        food_habit: 3,
        kitchen_preference: 3,
        smoking: 1,
        drinking: 2,
        sleep_schedule: 3,
        cleanliness: 4,
        social_level: 3,
        noise: 2,
        pets: 2,
        cooking: 4,
        personal_space: 3,
        chores: 2,
        rent_payment: 1,
        schedule: 3,
        guests: 3,
        overnight_guests: 2,
      },
      deal_breakers: ["smoking"],
    },
    {
      id: "11111111-1111-4111-8111-111111111105",
      email: "kabir.mehta@example.com",
      name: "Kabir Mehta",
      headline: "AI Engineer looking for a like-minded roommate",
      about: "Into hackathons, late-evening coding, and ordering good biryani on weekends.",
      age: 24,
      gender: "male",
      occupation: "working_professional",
      occupation_detail: "AI Engineer",
      city: "Delhi",
      preferred_localities: ["Hauz Khas", "Malviya Nagar", "Saket"],
      budget_min: 9500,
      budget_max: 16500,
      move_in_date: "2026-12-01",
      has_place: false,
      place: null,
      answers: {
        food_habit: 3,
        kitchen_preference: 3,
        smoking: 1,
        drinking: 2,
        sleep_schedule: 4,
        cleanliness: 4,
        social_level: 3,
        noise: 3,
        pets: 2,
        cooking: 2,
        personal_space: 3,
        chores: 2,
        rent_payment: 1,
        schedule: 3,
        guests: 3,
        overnight_guests: 2,
      },
      deal_breakers: ["late_rent"],
    },
  ];

  const users: Row[] = [];
  const userProfiles: Row[] = [];
  const userPreferences: Row[] = [];
  const userRoles: Row[] = [];
  const roommateProfiles: Row[] = [];
  const roommatePreferences: Row[] = [];
  const roommateLifestyleAnswers: Row[] = [];
  const roommateDealBreakers: Row[] = [];
  const roommatePlaces: Row[] = [];

  for (const r of sampleRoommates) {
    users.push({
      id: r.id,
      email: r.email,
      phone: "+919876543210",
      status: "active",
      intent: "find_roommate",
      onboarding_completed_at: now,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    });
    userProfiles.push({
      user_id: r.id,
      display_name: r.name,
      avatar_path: null,
      bio: r.about,
      age: r.age,
      gender: r.gender,
      occupation: r.occupation,
      occupation_detail: r.occupation_detail,
      hometown: r.city,
      languages: ["English", "Hindi"],
      created_at: now,
      updated_at: now,
    });
    userPreferences.push({
      user_id: r.id,
      preferred_city: r.city,
      preferred_localities: r.preferred_localities,
      budget_min: r.budget_min,
      budget_max: r.budget_max,
      move_in_date: r.move_in_date,
      preferred_gender_policy: "coed",
      preferred_property_types: ["pg", "flat"],
      email_notifications: true,
      push_notifications: true,
      updated_at: now,
    });
    userRoles.push({
      user_id: r.id,
      role: "seeker",
      granted_at: now,
    });
    roommateProfiles.push({
      user_id: r.id,
      status: "active",
      headline: r.headline,
      about: r.about,
      age: r.age,
      gender: r.gender,
      occupation: r.occupation,
      occupation_detail: r.occupation_detail,
      city: r.city,
      preferred_localities: r.preferred_localities,
      budget_min: r.budget_min,
      budget_max: r.budget_max,
      move_in_date: r.move_in_date,
      has_place: r.has_place,
      last_active_at: now,
      created_at: now,
      updated_at: now,
    });
    roommatePreferences.push({
      user_id: r.id,
      preferred_genders: [],
      age_min: 18,
      age_max: 35,
      occupation_prefs: [],
      updated_at: now,
    });
    for (const [qCode, val] of Object.entries(r.answers)) {
      roommateLifestyleAnswers.push({
        user_id: r.id,
        question_code: qCode,
        answer_value: val,
      });
    }
    for (const dbCode of r.deal_breakers) {
      roommateDealBreakers.push({
        user_id: r.id,
        code: dbCode,
      });
    }
    if (r.has_place && r.place) {
      roommatePlaces.push({
        user_id: r.id,
        ...r.place,
        created_at: now,
        updated_at: now,
      });
    }
  }

  return {
    version: 1,
    updatedAt: Date.now(),
    authUsersById: {},
    authUserIdByEmail: {},
    sessionsByToken: {},
    tables: {
      cities,
      amenities,
      lifestyle_questions: lifestyleQuestions,
      compatibility_weights: compatibilityWeights,
      users,
      user_profiles: userProfiles,
      user_preferences: userPreferences,
      user_roles: userRoles,
      owner_profiles: [],
      property_owners: [],
      properties: [],
      rooms: [],
      beds: [],
      property_media: [],
      property_photos: [],
      property_amenities: [],
      property_rules: [],
      property_charges: [],
      property_availability: [],
      property_stats_daily: [],
      verification_records: [],
      property_nearby_places: [],
      property_reviews: [],
      owner_replies: [],
      saved_properties: [],
      property_inquiries: [],
      bookings: [],
      payments: [],
      roommate_profiles: roommateProfiles,
      roommate_preferences: roommatePreferences,
      roommate_lifestyle_answers: roommateLifestyleAnswers,
      roommate_deal_breakers: roommateDealBreakers,
      roommate_places: roommatePlaces,
      roommate_photos: [],
      roommate_swipes: [],
      roommate_matches: [],
      conversations: [],
      conversation_participants: [],
      messages: [],
      message_attachments: [],
      notifications: [],
      reports: [],
      user_blocks: [],
      audit_logs: [],
      contact_messages: [],
      places: [],
    },
    storage: {},
  };
}

function getStore(): MemoryStore {
  if (typeof globalThis.__zoviaMemoryStore === "undefined") {
    try {
      if (fs.existsSync(MEMORY_STORE_FILE)) {
        const raw = fs.readFileSync(MEMORY_STORE_FILE, "utf8");
        globalThis.__zoviaMemoryStore = JSON.parse(raw) as MemoryStore;
      }
    } catch {
      // Fallback to fresh store
    }
    if (!globalThis.__zoviaMemoryStore) {
      globalThis.__zoviaMemoryStore = createInitialStore();
      persistStore(globalThis.__zoviaMemoryStore);
    }
    secureLegacyStore(globalThis.__zoviaMemoryStore);
  } else {
    try {
      if (fs.existsSync(MEMORY_STORE_FILE)) {
        const stat = fs.statSync(MEMORY_STORE_FILE);
        if (stat.mtimeMs > globalThis.__zoviaMemoryStore.updatedAt + 5) {
          const raw = fs.readFileSync(MEMORY_STORE_FILE, "utf8");
          globalThis.__zoviaMemoryStore = JSON.parse(raw) as MemoryStore;
          secureLegacyStore(globalThis.__zoviaMemoryStore);
        }
      }
    } catch {
      // ignore
    }
  }
  return globalThis.__zoviaMemoryStore;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string | undefined): boolean {
  const [scheme, saltHex, hashHex] = (stored ?? "").split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) {
    // Still spend the same time so response timing does not reveal unknown accounts.
    scryptSync(password, "zovia-dummy-salt", 64, { N: 16384, r: 8, p: 1 });
    return false;
  }
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, { N: 16384, r: 8, p: 1 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Upgrades store files written before hashing: plain passwords and raw-id sessions. */
function secureLegacyStore(store: MemoryStore): void {
  let changed = false;
  for (const user of Object.values(store.authUsersById)) {
    if (!user.passwordHash) {
      user.passwordHash = hashPassword(user.password ?? randomBytes(24).toString("hex"));
      changed = true;
    }
    if ("password" in user) {
      delete user.password;
      changed = true;
    }
  }
  for (const [key, value] of Object.entries(store.sessionsByToken)) {
    if (typeof value === "string") {
      delete store.sessionsByToken[key];
      changed = true;
    }
  }
  if (changed) persistStore(store);
}

function persistStore(store: MemoryStore): void {
  store.updatedAt = Date.now();
  try {
    // Owner-only file: it holds password hashes and session hashes.
    fs.writeFileSync(MEMORY_STORE_FILE, JSON.stringify(store), { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(MEMORY_STORE_FILE, 0o600);
  } catch {
    // Ignore filesystem errors in restricted environments
  }
}

function deriveNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "Member";
  const cleaned = local
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, "")
    .trim();
  if (!cleaned) return "Zovia Member";
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 60);
}

function ensureUserProvisioned(
  store: MemoryStore,
  params: { id?: string; email: string; password?: string; fullName?: string },
): AuthUserRecord {
  const normalizedEmail = params.email.trim().toLowerCase();
  const existingId = params.id ?? store.authUserIdByEmail[normalizedEmail];
  const now = new Date().toISOString();

  const userId = existingId ?? randomUUID();
  const displayName =
    params.fullName && params.fullName.trim().length >= 2
      ? params.fullName.trim()
      : store.authUsersById[userId]?.fullName ?? deriveNameFromEmail(normalizedEmail);

  const authUser: AuthUserRecord = {
    id: userId,
    email: normalizedEmail,
    passwordHash: params.password
      ? hashPassword(params.password)
      : (store.authUsersById[userId]?.passwordHash ?? hashPassword(randomBytes(24).toString("hex"))),
    fullName: displayName,
    createdAt: store.authUsersById[userId]?.createdAt ?? now,
  };

  store.authUsersById[userId] = authUser;
  store.authUserIdByEmail[normalizedEmail] = userId;

  const users = table(store, "users");
  let userRow = users.find((u) => u.id === userId);
  if (!userRow) {
    userRow = {
      id: userId,
      email: normalizedEmail,
      phone: null,
      status: "active",
      intent: "find_home",
      onboarding_completed_at: now,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    };
    users.push(userRow);
  } else {
    userRow.email = normalizedEmail;
    userRow.last_seen_at = now;
    if (!userRow.onboarding_completed_at) {
      userRow.onboarding_completed_at = now;
    }
  }

  const profiles = table(store, "user_profiles");
  let profileRow = profiles.find((p) => p.user_id === userId);
  if (!profileRow) {
    profileRow = {
      user_id: userId,
      display_name: displayName,
      avatar_path: null,
      bio: "Looking for a comfortable verified stay on Zovia.",
      age: 23,
      gender: "prefer_not_to_say",
      occupation: "working_professional",
      occupation_detail: null,
      hometown: null,
      languages: ["English", "Hindi"],
      created_at: now,
      updated_at: now,
    };
    profiles.push(profileRow);
  } else if (params.fullName && params.fullName.trim().length >= 2) {
    profileRow.display_name = params.fullName.trim();
  }

  const prefs = table(store, "user_preferences");
  let prefRow = prefs.find((p) => p.user_id === userId);
  if (!prefRow) {
    prefRow = {
      user_id: userId,
      preferred_city: "Bengaluru",
      preferred_localities: ["Koramangala", "HSR Layout"],
      budget_min: 8000,
      budget_max: 18000,
      move_in_date: null,
      preferred_gender_policy: null,
      preferred_property_types: ["pg", "hostel", "flat"],
      email_notifications: true,
      push_notifications: true,
      updated_at: now,
    };
    prefs.push(prefRow);
  }

  const roles = table(store, "user_roles");
  const hasSeeker = roles.some((r) => r.user_id === userId && r.role === "seeker");
  if (!hasSeeker) {
    roles.push({ user_id: userId, role: "seeker", granted_at: now });
  }
  const hasOwner = roles.some((r) => r.user_id === userId && r.role === "owner");
  if (!hasOwner) {
    roles.push({ user_id: userId, role: "owner", granted_at: now });
  }
  // Admin only for the developer allowlist (ADMIN_EMAILS), never from the e-mail's wording.
  if (memoryMayAutoGrantAdmin() && isDeveloperEmail(normalizedEmail)) {
    const hasAdmin = roles.some((r) => r.user_id === userId && r.role === "admin");
    if (!hasAdmin) {
      roles.push({ user_id: userId, role: "admin", granted_at: now });
    }
  }

  const ownerProfiles = table(store, "owner_profiles");
  if (!ownerProfiles.some((o) => o.user_id === userId)) {
    const ownerRow = {
      user_id: userId,
      owner_type: "individual",
      business_name: `${displayName} Stays`,
      about: "Verified Zovia Host",
      contact_phone: "+919876543210",
      contact_email: normalizedEmail,
      whatsapp_number: "+919876543210",
      verification_status: "verified",
      verified_at: now,
      response_rate: 98,
      response_time_hours: 1,
      created_at: now,
      updated_at: now,
    };
    ownerProfiles.push(ownerRow);
    table(store, "property_owners").push({ ...ownerRow });
  }

  const notifications = table(store, "notifications");
  if (!notifications.some((n) => n.user_id === userId)) {
    notifications.push({
      id: randomUUID(),
      user_id: userId,
      kind: "system",
      title: `Welcome to Zovia, ${displayName}!`,
      body: "Your account is active in memory. Explore verified PGs across 25 Indian cities, save favourites, match with roommates, or list a property.",
      link_path: "/search",
      data: {},
      read_at: null,
      created_at: now,
    });
  }

  persistStore(store);
  return authUser;
}

/** Synthesize a property row from a `catalog:<slug>` id or slug when needed for joins/saves/bookings. */
function resolvePropertyFromStoreOrCatalog(store: MemoryStore, idOrSlug: string): Row | null {
  const existing = table(store, "properties").find(
    (p) => p.id === idOrSlug || p.slug === idOrSlug,
  );
  if (existing) return existing;

  const slug = idOrSlug.startsWith("catalog:") ? idOrSlug.slice("catalog:".length) : idOrSlug;
  const item = getCatalogListing(slug);
  if (!item) return null;

  const firstSharing = item.sharing[0];
  const deposit = firstSharing?.deposit ?? item.price_from * 2;
  const coverUrl = item.photos[0]?.url ?? null;

  return {
    id: item.id,
    owner_id: "11111111-1111-4111-8111-111111111101",
    slug: item.slug,
    title: item.title,
    description: item.about,
    property_type: item.property_type,
    listing_mode: "per_bed",
    status: "published",
    gender_policy: item.gender,
    tenant_gender: item.gender,
    furnishing: item.furnishing,
    city_id: null,
    city: item.city,
    state: item.state,
    locality: item.locality,
    address_line: item.address,
    landmark: item.locality,
    postal_code: "560001",
    pincode: "560001",
    location: `POINT(${item.lng} ${item.lat})`,
    monthly_rent: item.price_from,
    min_rent: item.price_from,
    max_rent: item.price_from + 4000,
    security_deposit: deposit,
    notice_period_days: item.rules.notice_days,
    lock_in_months: 1,
    food_included: item.food.provided,
    food_available: item.food.provided,
    meal_types: item.food.meals,
    electricity_included: false,
    water_included: true,
    wifi_included: true,
    housekeeping_frequency: "3 times a week",
    curfew_time: item.rules.gate_closes,
    visitors_allowed: item.rules.guests !== "not_allowed",
    overnight_guests_allowed: item.rules.guests === "allowed",
    smoking_allowed: item.rules.smoking !== "not_allowed",
    drinking_allowed: item.rules.alcohol,
    pets_allowed: item.rules.pets,
    total_beds: item.total_beds,
    available_beds: item.available_beds,
    available_from: new Date().toISOString().slice(0, 10),
    cover_media_path: coverUrl,
    is_verified: true,
    is_featured: false,
    completeness_score: 95,
    rating_avg: 4.6,
    rating_count: 14,
    view_count: 42,
    save_count: 7,
    inquiry_count: 3,
    published_at: new Date().toISOString(),
    last_confirmed_at: new Date().toISOString(),
    deleted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function getTableRows(store: MemoryStore, tableName: string): Row[] {
  if (tableName === "public_user_cards") {
    return table(store, "user_profiles").map((p) => ({
      user_id: p.user_id,
      display_name: p.display_name,
      avatar_path: p.avatar_path,
      occupation: p.occupation,
      age: p.age,
      gender: p.gender,
    }));
  }
  if (tableName === "property_owner_cards") {
    return table(store, "owner_profiles").map((o) => {
      const profile = table(store, "user_profiles").find((p) => p.user_id === o.user_id);
      return {
        user_id: o.user_id,
        display_name: profile?.display_name ?? o.business_name ?? "Verified Host",
        avatar_path: profile?.avatar_path ?? null,
        business_name: o.business_name,
        about: o.about,
        verification_status: o.verification_status,
        verified_at: o.verified_at,
        response_rate: o.response_rate,
        response_time_hours: o.response_time_hours,
        member_since: o.created_at,
      };
    });
  }
  return table(store, tableName);
}

function attachRelations(store: MemoryStore, tableName: string, row: Row, selectColumns?: string): Row {
  const enriched: Row = { ...row };
  const sel = selectColumns ?? "";

  if (tableName === "users") {
    if (sel.includes("user_roles")) {
      enriched.user_roles = table(store, "user_roles")
        .filter((r) => r.user_id === row.id)
        .map((r) => ({ role: r.role }));
    }
    if (sel.includes("user_profiles")) {
      const prof = table(store, "user_profiles").find((p) => p.user_id === row.id);
      enriched.user_profiles = prof ?? {
        user_id: row.id,
        display_name: deriveNameFromEmail(String(row.email ?? "Member")),
        avatar_path: null,
        bio: null,
        age: null,
        gender: null,
        occupation: null,
        occupation_detail: null,
        hometown: null,
        languages: [],
      };
    }
    if (sel.includes("user_preferences")) {
      const pref = table(store, "user_preferences").find((p) => p.user_id === row.id);
      enriched.user_preferences = pref ?? {
        user_id: row.id,
        preferred_city: "Bengaluru",
        preferred_localities: [],
        budget_min: null,
        budget_max: null,
        move_in_date: null,
        preferred_gender_policy: null,
        preferred_property_types: [],
        email_notifications: true,
        push_notifications: true,
      };
    }
  }

  if (tableName === "saved_properties") {
    const prop = resolvePropertyFromStoreOrCatalog(store, String(row.property_id ?? ""));
    enriched.property = prop;
    enriched.properties = prop;
  }

  if (tableName === "property_inquiries") {
    const prop = resolvePropertyFromStoreOrCatalog(store, String(row.property_id ?? ""));
    enriched.property = prop;
    enriched.properties = prop;
  }

  if (tableName === "bookings") {
    const prop = resolvePropertyFromStoreOrCatalog(store, String(row.property_id ?? ""));
    enriched.properties = prop;
    enriched.property = prop;
    const room = row.room_id ? table(store, "rooms").find((r) => r.id === row.room_id) ?? null : null;
    const bed = row.bed_id ? table(store, "beds").find((b) => b.id === row.bed_id) ?? null : null;
    const payments = table(store, "payments").filter((p) => p.booking_id === row.id);
    enriched.rooms = room;
    enriched.beds = bed;
    enriched.payments = payments;
  }

  if (tableName === "messages") {
    enriched.message_attachments = table(store, "message_attachments").filter(
      (a) => a.message_id === row.id,
    );
  }

  if (tableName === "property_amenities") {
    const amenity = table(store, "amenities").find(
      (a) => a.id === row.amenity_id || a.code === row.amenity_code,
    );
    enriched.amenities = amenity ?? null;
  }

  if (tableName === "property_reviews") {
    const prop = resolvePropertyFromStoreOrCatalog(store, String(row.property_id ?? ""));
    enriched.properties = prop;
    const replies = table(store, "owner_replies").filter((rep) => rep.review_id === row.id);
    enriched.owner_replies = replies;
  }

  if (tableName === "reports") {
    const reporter = table(store, "user_profiles").find((p) => p.user_id === row.reporter_id);
    enriched.reporter = reporter ?? null;
  }

  return enriched;
}

class MemoryQueryBuilder {
  private store: MemoryStore;
  private tableName: string;
  private operation: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private selectCols = "*";
  private selectOpts: { count?: "exact" | "planned" | "estimated"; head?: boolean } = {};
  private payload: unknown = null;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private filters: ((row: Row) => boolean)[] = [];
  private sorts: { column: string; ascending: boolean }[] = [];
  private rangeBounds: { from: number; to: number } | null = null;
  private limitCount: number | null = null;
  private expectSingle = false;
  private expectMaybeSingle = false;

  constructor(store: MemoryStore, tableName: string) {
    this.store = store;
    this.tableName = tableName;
  }

  select(columns = "*", options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): this {
    if (this.operation === "select") {
      this.selectCols = columns;
      if (options) this.selectOpts = options;
    } else {
      this.selectCols = columns;
    }
    return this;
  }

  insert(values: unknown): this {
    this.operation = "insert";
    this.payload = values;
    return this;
  }

  update(values: unknown): this {
    this.operation = "update";
    this.payload = values;
    return this;
  }

  upsert(values: unknown, options?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.operation = "upsert";
    this.payload = values;
    if (options) this.upsertOpts = options;
    return this;
  }

  delete(options?: { count?: "exact" | "planned" | "estimated" }): this {
    this.operation = "delete";
    if (options) this.selectOpts = options;
    return this;
  }

  eq(column: string, value: unknown): this {
    const cleanCol = column.includes(".") ? column.split(".").pop() ?? column : column;
    this.filters.push((row) => {
      if (column.includes(".")) {
        const parts = column.split(".");
        const rel = parts[0];
        const field = parts[1];
        if (rel && field) {
          const relObj = row[rel] as Row | undefined;
          if (relObj && typeof relObj === "object") {
            return relObj[field] === value;
          }
        }
      }
      return row[cleanCol] === value;
    });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  in(column: string, values: readonly unknown[]): this {
    const set = new Set(values);
    this.filters.push((row) => set.has(row[column]));
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push((row) => {
      const v = row[column];
      return v !== null && v !== undefined && (v as string | number) > (value as string | number);
    });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push((row) => {
      const v = row[column];
      return v !== null && v !== undefined && (v as string | number) >= (value as string | number);
    });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push((row) => {
      const v = row[column];
      return v !== null && v !== undefined && (v as string | number) < (value as string | number);
    });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push((row) => {
      const v = row[column];
      return v !== null && v !== undefined && (v as string | number) <= (value as string | number);
    });
    return this;
  }

  ilike(column: string, pattern: string): this {
    const clean = pattern.replace(/%/g, "").toLowerCase();
    this.filters.push((row) => String(row[column] ?? "").toLowerCase().includes(clean));
    return this;
  }

  or(expr: string): this {
    this.filters.push((row) => {
      const userMatches = [...expr.matchAll(/([a-zA-Z0-9_]+)\.eq\.([a-zA-Z0-9_-]+)/g)];
      if (userMatches.length > 0 && !expr.includes(".lt.")) {
        return userMatches.some(([, col, val]) => col !== undefined && String(row[col]) === val);
      }
      return true;
    });
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.sorts.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  range(from: number, to: number): this {
    this.rangeBounds = { from, to };
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  single(): this {
    this.expectSingle = true;
    return this;
  }

  maybeSingle(): this {
    this.expectMaybeSingle = true;
    return this;
  }

  private execute(): {
    data: unknown;
    error: null | { message: string; code: string; details: string; hint: string };
    count: number | null;
  } {
    const tbl = getTableRows(this.store, this.tableName);
    const now = new Date().toISOString();

    if (this.operation === "insert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const inserted: Row[] = [];
      for (const raw of items) {
        const id = String(raw.id ?? randomUUID());
        const defaults: Row = {};
        if (this.tableName === "properties") {
          const slugBase = String(raw.title ?? "property")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          defaults.slug = raw.slug ?? `${slugBase || "listing"}-${id.slice(0, 6)}`;
          defaults.status = raw.status ?? "draft";
          defaults.deleted_at = null;
          defaults.rejection_reason = null;
          defaults.total_beds = raw.total_beds ?? 1;
          defaults.available_beds = raw.available_beds ?? 1;
          defaults.min_rent = raw.min_rent ?? raw.monthly_rent ?? 10000;
          defaults.max_rent = raw.max_rent ?? raw.monthly_rent ?? 10000;
          defaults.cover_media_path = raw.cover_media_path ?? null;
          defaults.submitted_at = null;
          defaults.published_at = null;
          defaults.last_confirmed_at = now;
        } else if (this.tableName === "rooms") {
          defaults.deleted_at = null;
          defaults.position = raw.position ?? 0;
        } else if (this.tableName === "beds") {
          defaults.status = raw.status ?? "available";
          defaults.available_from = raw.available_from ?? null;
          defaults.rent_override = raw.rent_override ?? null;
        }
        const newRow: Row = {
          id,
          created_at: raw.created_at ?? now,
          updated_at: raw.updated_at ?? now,
          ...defaults,
          ...raw,
        };
        tbl.push(newRow);
        if (this.tableName === "properties") {
          table(this.store, "property_availability").push({
            property_id: id,
            status: "available",
            available_from: now.slice(0, 10),
            min_stay_months: 1,
            notice_period_days: 30,
            last_confirmed_at: now,
          });
        }
        inserted.push(attachRelations(this.store, this.tableName, newRow, this.selectCols));
      }
      persistStore(this.store);
      return this.formatResult(inserted, inserted.length);
    }

    if (this.operation === "upsert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const conflictCols = (this.upsertOpts.onConflict ?? "id,user_id")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const upserted: Row[] = [];

      for (const raw of items) {
        const existingIdx = tbl.findIndex(
          (existing) =>
            conflictCols.length > 0 &&
            conflictCols.every((col) => raw[col] !== undefined && existing[col] === raw[col]),
        );
        if (existingIdx >= 0) {
          const existingRow = tbl[existingIdx];
          if (existingRow && !this.upsertOpts.ignoreDuplicates) {
            tbl[existingIdx] = {
              ...existingRow,
              ...raw,
              updated_at: now,
            };
          }
          const targetRow = tbl[existingIdx] ?? raw;
          upserted.push(attachRelations(this.store, this.tableName, targetRow, this.selectCols));
        } else {
          const newRow: Row = {
            id: raw.id ?? randomUUID(),
            created_at: raw.created_at ?? now,
            updated_at: raw.updated_at ?? now,
            ...raw,
          };
          tbl.push(newRow);
          upserted.push(attachRelations(this.store, this.tableName, newRow, this.selectCols));
        }
      }
      persistStore(this.store);
      return this.formatResult(upserted, upserted.length);
    }

    if (this.operation === "update") {
      const patch = (this.payload ?? {}) as Row;
      const updated: Row[] = [];
      for (let i = 0; i < tbl.length; i++) {
        const row = tbl[i];
        if (!row) continue;
        const enriched = attachRelations(this.store, this.tableName, row, this.selectCols);
        if (this.filters.every((fn) => fn(enriched))) {
          const nextRow: Row = { ...row, ...patch, updated_at: now };
          tbl[i] = nextRow;
          updated.push(attachRelations(this.store, this.tableName, nextRow, this.selectCols));
        }
      }
      persistStore(this.store);
      return this.formatResult(updated, updated.length);
    }

    if (this.operation === "delete") {
      const kept: Row[] = [];
      const removed: Row[] = [];
      for (const row of tbl) {
        const enriched = attachRelations(this.store, this.tableName, row, this.selectCols);
        if (this.filters.every((fn) => fn(enriched))) {
          removed.push(enriched);
        } else {
          kept.push(row);
        }
      }
      this.store.tables[this.tableName] = kept;
      persistStore(this.store);
      return this.formatResult(removed, removed.length);
    }

    let rows = tbl.map((r) => attachRelations(this.store, this.tableName, r, this.selectCols));
    rows = rows.filter((r) => this.filters.every((fn) => fn(r)));
    const totalCount = rows.length;

    if (this.sorts.length > 0) {
      rows.sort((a, b) => {
        for (const { column, ascending } of this.sorts) {
          const va = a[column];
          const vb = b[column];
          if (va === vb) continue;
          if (va === null || va === undefined) return 1;
          if (vb === null || vb === undefined) return -1;
          const cmp = (va as string | number) < (vb as string | number) ? -1 : 1;
          return ascending ? cmp : -cmp;
        }
        return 0;
      });
    }

    if (this.rangeBounds) {
      rows = rows.slice(this.rangeBounds.from, this.rangeBounds.to + 1);
    }
    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    if (this.selectOpts.head) {
      return { data: null, error: null, count: totalCount };
    }

    return this.formatResult(rows, totalCount);
  }

  private formatResult(rows: Row[], totalCount: number) {
    if (this.expectSingle) {
      if (rows.length === 0) {
        return {
          data: null,
          error: {
            message: "JSON object requested, multiple (or no) rows returned",
            code: "PGRST116",
            details: "The result contains 0 rows",
            hint: "",
          },
          count: 0,
        };
      }
      return { data: rows[0] ?? null, error: null, count: 1 };
    }
    if (this.expectMaybeSingle) {
      return { data: rows[0] ?? null, error: null, count: rows.length };
    }
    return {
      data: rows,
      error: null,
      count: this.selectOpts.count ? totalCount : rows.length,
    };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown; count: number | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

function buildRoommateCardRow(store: MemoryStore, userId: string): Row | null {
  const rp = table(store, "roommate_profiles").find((r) => r.user_id === userId);
  if (!rp) return null;
  const up = table(store, "user_profiles").find((p) => p.user_id === userId);
  const prefs = table(store, "roommate_preferences").find((p) => p.user_id === userId);
  const place = table(store, "roommate_places").find((p) => p.user_id === userId);
  const answersList = table(store, "roommate_lifestyle_answers").filter((a) => a.user_id === userId);
  const answers: Record<string, number> = {};
  for (const a of answersList) {
    answers[String(a.question_code)] = Number(a.answer_value);
  }
  const dealBreakers = table(store, "roommate_deal_breakers")
    .filter((d) => d.user_id === userId)
    .map((d) => String(d.code));
  const photos = table(store, "roommate_photos")
    .filter((ph) => ph.user_id === userId)
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((ph) => String(ph.storage_path));

  return {
    user_id: userId,
    display_name: up?.display_name ?? "Zovia Member",
    avatar_path: up?.avatar_path ?? null,
    status: rp.status ?? "active",
    headline: rp.headline ?? null,
    about: rp.about ?? null,
    age: rp.age ?? up?.age ?? 24,
    gender: rp.gender ?? up?.gender ?? null,
    occupation: rp.occupation ?? up?.occupation ?? null,
    occupation_detail: rp.occupation_detail ?? up?.occupation_detail ?? null,
    city: rp.city ?? "Bengaluru",
    preferred_localities: Array.isArray(rp.preferred_localities) ? rp.preferred_localities : [],
    budget_min: rp.budget_min ?? 8000,
    budget_max: rp.budget_max ?? 18000,
    move_in_date: rp.move_in_date ?? null,
    has_place: Boolean(rp.has_place),
    last_active_at: rp.last_active_at ?? new Date().toISOString(),
    photos,
    answers,
    deal_breakers: dealBreakers,
    preferences: prefs
      ? {
          preferred_genders: Array.isArray(prefs.preferred_genders) ? prefs.preferred_genders : [],
          age_min: prefs.age_min ?? null,
          age_max: prefs.age_max ?? null,
          occupation_prefs: Array.isArray(prefs.occupation_prefs) ? prefs.occupation_prefs : [],
        }
      : { preferred_genders: [], age_min: null, age_max: null, occupation_prefs: [] },
    place:
      rp.has_place && place
        ? {
            title: place.title,
            description: place.description ?? null,
            property_type: place.property_type ?? "flat",
            locality: place.locality ?? null,
            city: place.city ?? rp.city ?? null,
            rent_share: place.rent_share ?? null,
            deposit_share: place.deposit_share ?? null,
            vacancies: place.vacancies ?? 1,
            available_from: place.available_from ?? null,
            furnishing: place.furnishing ?? null,
          }
        : null,
  };
}

function executeRpc(
  store: MemoryStore,
  currentUserId: string | null,
  fn: string,
  args: Record<string, unknown> = {},
): { data: unknown; error: null | { message: string; code: string; details: string; hint: string } } {
  const now = new Date().toISOString();

  switch (fn) {
    case "is_staff": {
      if (!currentUserId) return { data: false, error: null };
      const isStaff = table(store, "user_roles").some(
        (r) => r.user_id === currentUserId && (r.role === "admin" || r.role === "moderator"),
      );
      return { data: isStaff, error: null };
    }

    case "consume_rate_limit":
    case "check_rate_limit": {
      return {
        data: [{ allowed: true, remaining: 99, retry_after_seconds: 0 }],
        error: null,
      };
    }

    case "search_properties": {
      const published = table(store, "properties").filter(
        (p) => p.status === "published" && !p.deleted_at,
      );
      const rows = published.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        property_type: p.property_type,
        listing_mode: p.listing_mode,
        gender_policy: p.gender_policy ?? p.tenant_gender ?? "coed",
        furnishing: p.furnishing,
        city: p.city,
        locality: p.locality,
        landmark: p.landmark,
        price_from: p.min_rent ?? p.monthly_rent ?? 10000,
        security_deposit: p.security_deposit ?? 20000,
        food_included: Boolean(p.food_included),
        available_beds: p.available_beds ?? 2,
        total_beds: p.total_beds ?? 4,
        available_from: p.available_from ?? now.slice(0, 10),
        cover_media_path: p.cover_media_path ?? null,
        is_verified: Boolean(p.is_verified),
        is_featured: Boolean(p.is_featured),
        rating_avg: p.rating_avg ?? 4.7,
        rating_count: p.rating_count ?? 8,
        lat: 12.9352,
        lng: 77.6245,
        distance_km: null,
        amenity_codes: ["wifi", "ac", "laundry"],
        total_count: published.length,
      }));
      return { data: rows, error: null };
    }

    case "create_property_inquiry": {
      const userId = currentUserId ?? "11111111-1111-4111-8111-111111111101";
      const propertyId = String(args.p_property_id ?? "");
      const prop = resolvePropertyFromStoreOrCatalog(store, propertyId);
      const id = randomUUID();
      table(store, "property_inquiries").push({
        id,
        property_id: propertyId,
        seeker_id: userId,
        owner_id: prop?.owner_id ?? "11111111-1111-4111-8111-111111111101",
        room_id: args.p_room_id ?? null,
        message: String(args.p_message ?? ""),
        move_in_date: args.p_move_in_date ?? null,
        occupants: Number(args.p_occupants ?? 1),
        status: "open",
        owner_responded_at: null,
        created_at: now,
        updated_at: now,
      });
      persistStore(store);
      return { data: id, error: null };
    }

    case "reveal_owner_contact": {
      const propertyId = String(args.p_property_id ?? "");
      const prop = resolvePropertyFromStoreOrCatalog(store, propertyId);
      const ownerProfile = table(store, "owner_profiles").find((o) => o.user_id === prop?.owner_id);
      return {
        data: [
          {
            display_name: ownerProfile?.business_name ?? "Zovia Verified Host",
            contact_phone: ownerProfile?.contact_phone ?? "+91 98765 43210",
            whatsapp_number: ownerProfile?.whatsapp_number ?? "+91 98765 43210",
          },
        ],
        error: null,
      };
    }

    // Booking and payment rules live in SQL (bed locks, tenant/seeker ids, approve/reject decisions).
    // The demo store cannot reproduce them faithfully, so it refuses instead of corrupting state.
    case "request_booking":
    case "owner_respond_booking":
    case "cancel_booking":
    case "booking_payable_amount":
    case "record_payment_order":
    case "confirm_booking_payment":
      return {
        data: null,
        error: {
          code: "PGRST002",
          message: "Bookings and payments need the database: the demo memory store cannot run them.",
          details: "",
          hint: "",
        },
      };

    case "roommate_candidates": {
      const limit = Number(args.p_limit ?? 40);
      const swipedIds = new Set(
        table(store, "roommate_swipes")
          .filter((s) => s.swiper_id === currentUserId)
          .map((s) => String(s.target_id)),
      );
      const callerProfile = table(store, "roommate_profiles").find((r) => r.user_id === currentUserId);
      const callerCity = String(callerProfile?.city ?? "").toLowerCase();

      const candidates = table(store, "roommate_profiles")
        .filter((r) => r.user_id !== currentUserId && r.status === "active" && !swipedIds.has(String(r.user_id)))
        .map((r) => {
          const card = buildRoommateCardRow(store, String(r.user_id));
          if (!card) return null;
          if (callerCity && String(card.city ?? "").toLowerCase() !== callerCity) {
            return { ...card, city: callerProfile?.city };
          }
          return card;
        })
        .filter((c): c is Row => c !== null)
        .slice(0, limit);

      return { data: candidates, error: null };
    }

    case "roommate_profile_cards": {
      const ids = Array.isArray(args.p_user_ids) ? args.p_user_ids.map(String) : [];
      const cards = ids
        .map((id) => buildRoommateCardRow(store, id))
        .filter((c): c is Row => c !== null);
      return { data: cards, error: null };
    }

    case "roommate_swipe": {
      const swiperId = currentUserId ?? "11111111-1111-4111-8111-111111111101";
      const targetId = String(args.p_target_id ?? "");
      const action = String(args.p_action ?? "like");

      table(store, "roommate_swipes").push({
        id: randomUUID(),
        swiper_id: swiperId,
        target_id: targetId,
        action,
        created_at: now,
      });

      if (action === "like") {
        const [userA, userB] = swiperId < targetId ? [swiperId, targetId] : [targetId, swiperId];
        const matches = table(store, "roommate_matches");
        let match = matches.find((m) => m.user_a === userA && m.user_b === userB);
        let newMatch = false;
        if (!match) {
          newMatch = true;
          const convId = randomUUID();
          const matchId = randomUUID();
          const targetProfile = table(store, "user_profiles").find((p) => p.user_id === targetId);
          const greetingText = `Hi! Excited to match with you on Zovia. Are you still looking for a roommate?`;

          table(store, "conversations").push({
            id: convId,
            kind: "roommate_match",
            property_id: null,
            inquiry_id: null,
            match_id: matchId,
            last_message_at: now,
            last_message_preview: greetingText,
            created_at: now,
            updated_at: now,
          });
          table(store, "conversation_participants").push(
            { conversation_id: convId, user_id: swiperId, last_read_at: null, joined_at: now },
            { conversation_id: convId, user_id: targetId, last_read_at: now, joined_at: now },
          );
          table(store, "messages").push({
            id: randomUUID(),
            conversation_id: convId,
            sender_id: targetId,
            kind: "text",
            body: greetingText,
            deleted_at: null,
            created_at: now,
          });

          match = {
            id: matchId,
            user_a: userA,
            user_b: userB,
            status: "active",
            conversation_id: convId,
            matched_at: now,
            unmatched_at: null,
          };
          matches.push(match);

          table(store, "notifications").push({
            id: randomUUID(),
            user_id: swiperId,
            kind: "roommate_match",
            title: `New roommate match with ${targetProfile?.display_name ?? "a member"}!`,
            body: greetingText,
            link_path: `/messages/${convId}`,
            data: { match_id: matchId, conversation_id: convId },
            read_at: null,
            created_at: now,
          });
        } else if (match.status !== "active") {
          match.status = "active";
          newMatch = true;
        }

        persistStore(store);
        return {
          data: [
            {
              matched: true,
              new_match: newMatch,
              match_id: match.id,
              conversation_id: match.conversation_id,
            },
          ],
          error: null,
        };
      }

      persistStore(store);
      return {
        data: [{ matched: false, new_match: false, match_id: null, conversation_id: null }],
        error: null,
      };
    }

    case "roommate_unmatch": {
      const matchId = String(args.p_match_id ?? "");
      const match = table(store, "roommate_matches").find((m) => m.id === matchId);
      if (match) {
        match.status = "unmatched";
        match.unmatched_at = now;
        persistStore(store);
      }
      return { data: true, error: null };
    }

    case "my_conversations": {
      if (!currentUserId) return { data: [], error: null };
      const participants = table(store, "conversation_participants");
      const conversations = table(store, "conversations");
      const messages = table(store, "messages");
      const userProfiles = table(store, "user_profiles");

      const myParticipations = participants.filter((cp) => cp.user_id === currentUserId);
      const results: Row[] = [];

      for (const myPart of myParticipations) {
        const conv = conversations.find((c) => c.id === myPart.conversation_id);
        if (!conv) continue;
        const otherPart = participants.find(
          (cp) => cp.conversation_id === conv.id && cp.user_id !== currentUserId,
        );
        const otherUserId = String(otherPart?.user_id ?? "11111111-1111-4111-8111-111111111101");
        const otherProfile = userProfiles.find((p) => p.user_id === otherUserId);
        const prop = conv.property_id
          ? resolvePropertyFromStoreOrCatalog(store, String(conv.property_id))
          : null;

        const convMessages = messages.filter(
          (m) => m.conversation_id === conv.id && !m.deleted_at,
        );
        const lastRead = myPart.last_read_at ? String(myPart.last_read_at) : null;
        const unreadCount = convMessages.filter(
          (m) => m.sender_id !== currentUserId && (!lastRead || String(m.created_at) > lastRead),
        ).length;

        results.push({
          id: conv.id,
          kind: conv.kind ?? "direct",
          last_message_at: conv.last_message_at ?? conv.created_at,
          last_message_preview: conv.last_message_preview ?? "Start the conversation",
          created_at: conv.created_at,
          my_last_read_at: myPart.last_read_at ?? null,
          other_last_read_at: otherPart?.last_read_at ?? null,
          unread_count: unreadCount,
          other_user_id: otherUserId,
          other_display_name: otherProfile?.display_name ?? "Zovia Member",
          other_avatar_path: otherProfile?.avatar_path ?? null,
          property_id: prop?.id ?? null,
          property_slug: prop?.slug ?? null,
          property_title: prop?.title ?? null,
          inquiry_id: conv.inquiry_id ?? null,
          match_id: conv.match_id ?? null,
        });
      }

      results.sort((a, b) =>
        String(b.last_message_at ?? "").localeCompare(String(a.last_message_at ?? "")),
      );
      return { data: results, error: null };
    }

    case "send_message": {
      const senderId = currentUserId ?? "11111111-1111-4111-8111-111111111101";
      const convId = String(args.p_conversation_id ?? "");
      const bodyText = args.p_body ? String(args.p_body) : null;
      const msgId = randomUUID();

      const msgRow: Row = {
        id: msgId,
        conversation_id: convId,
        sender_id: senderId,
        kind: args.p_attachment_path ? "image" : "text",
        body: bodyText,
        deleted_at: null,
        created_at: now,
      };
      table(store, "messages").push(msgRow);

      if (args.p_attachment_path) {
        table(store, "message_attachments").push({
          id: randomUUID(),
          message_id: msgId,
          storage_path: String(args.p_attachment_path),
          mime_type: String(args.p_attachment_mime ?? "image/jpeg"),
          size_bytes: Number(args.p_attachment_bytes ?? 1024),
          width: args.p_attachment_width ? Number(args.p_attachment_width) : null,
          height: args.p_attachment_height ? Number(args.p_attachment_height) : null,
          created_at: now,
        });
      }

      const conv = table(store, "conversations").find((c) => c.id === convId);
      if (conv) {
        conv.last_message_at = now;
        conv.last_message_preview = bodyText ?? "Sent a photo";
        conv.updated_at = now;
      }

      persistStore(store);
      return {
        data: [
          {
            id: msgId,
            conversation_id: convId,
            sender_id: senderId,
            kind: msgRow.kind,
            body: bodyText,
            created_at: now,
          },
        ],
        error: null,
      };
    }

    case "mark_conversation_read": {
      const convId = String(args.p_conversation_id ?? "");
      const part = table(store, "conversation_participants").find(
        (cp) => cp.conversation_id === convId && cp.user_id === currentUserId,
      );
      if (part) {
        part.last_read_at = now;
        persistStore(store);
      }
      return { data: now, error: null };
    }

    case "start_inquiry_conversation": {
      const inquiryId = String(args.p_inquiry_id ?? "");
      const inq = table(store, "property_inquiries").find((i) => i.id === inquiryId);
      const conversations = table(store, "conversations");
      let conv = conversations.find((c) => c.inquiry_id === inquiryId);
      if (!conv) {
        const convId = randomUUID();
        const seekerId = String(inq?.seeker_id ?? currentUserId ?? "11111111-1111-4111-8111-111111111101");
        const ownerId = String(inq?.owner_id ?? "11111111-1111-4111-8111-111111111101");
        conv = {
          id: convId,
          kind: "property_inquiry",
          property_id: inq?.property_id ?? null,
          inquiry_id: inquiryId,
          match_id: null,
          last_message_at: now,
          last_message_preview: String(inq?.message ?? "Property enquiry"),
          created_at: now,
          updated_at: now,
        };
        conversations.push(conv);
        table(store, "conversation_participants").push(
          { conversation_id: convId, user_id: seekerId, last_read_at: now, joined_at: now },
          { conversation_id: convId, user_id: ownerId, last_read_at: now, joined_at: now },
        );
        if (inq?.message) {
          table(store, "messages").push({
            id: randomUUID(),
            conversation_id: convId,
            sender_id: seekerId,
            kind: "text",
            body: String(inq.message),
            deleted_at: null,
            created_at: now,
          });
        }
        persistStore(store);
      }
      return { data: conv.id, error: null };
    }

    case "mark_notifications_read": {
      if (!currentUserId) return { data: 0, error: null };
      const ids = Array.isArray(args.p_ids) ? new Set(args.p_ids.map(String)) : null;
      let count = 0;
      for (const n of table(store, "notifications")) {
        if (n.user_id === currentUserId && !n.read_at && (!ids || ids.has(String(n.id)))) {
          n.read_at = now;
          count++;
        }
      }
      persistStore(store);
      return { data: count, error: null };
    }

    case "become_owner": {
      if (!currentUserId) return { data: null, error: null };
      const roles = table(store, "user_roles");
      const hasRole = roles.some(
        (r) => r.user_id === currentUserId && r.role === "owner",
      );
      if (!hasRole) {
        roles.push({ user_id: currentUserId, role: "owner", granted_at: now });
      }
      const ownerPatch = {
        user_id: currentUserId,
        owner_type: args.p_owner_type ?? "individual",
        business_name: args.p_business_name ?? "Verified Host",
        about: args.p_about ?? null,
        contact_phone: args.p_contact_phone ?? "+919876543210",
        contact_email: args.p_contact_email ?? null,
        whatsapp_number: args.p_whatsapp_number ?? null,
        verification_status: "verified",
        verified_at: now,
        response_rate: 100,
        response_time_hours: 1,
        created_at: now,
        updated_at: now,
      };
      for (const tbl of [table(store, "owner_profiles"), table(store, "property_owners")]) {
        const existing = tbl.find((o) => o.user_id === currentUserId);
        if (existing) {
          Object.assign(existing, ownerPatch);
        } else {
          tbl.push({ ...ownerPatch });
        }
      }
      persistStore(store);
      return { data: currentUserId, error: null };
    }

    case "submit_property_for_review": {
      const propId = String(args.p_property_id ?? "");
      const prop = table(store, "properties").find((p) => p.id === propId);
      if (prop) {
        prop.status = "published";
        prop.submitted_at = now;
        prop.published_at = now;
        prop.last_confirmed_at = now;
        prop.updated_at = now;
        persistStore(store);
      }
      return { data: [], error: null };
    }

    case "owner_set_listing_status": {
      const propId = String(args.p_property_id ?? "");
      const status = String(args.p_status ?? "published");
      const prop = table(store, "properties").find((p) => p.id === propId);
      if (prop) {
        prop.status = status;
        prop.updated_at = now;
        persistStore(store);
      }
      return { data: status, error: null };
    }

    case "confirm_listing": {
      const propId = String(args.p_property_id ?? "");
      const prop = table(store, "properties").find((p) => p.id === propId);
      if (prop) {
        prop.last_confirmed_at = now;
        prop.updated_at = now;
        persistStore(store);
      }
      return { data: now, error: null };
    }

    case "submit_report":
    case "report_message": {
      const id = randomUUID();
      table(store, "reports").push({
        id,
        reporter_id: currentUserId,
        target_type: args.p_target_type ?? "message",
        target_id: args.p_target_id ?? args.p_message_id ?? randomUUID(),
        reason: args.p_reason ?? "other",
        details: args.p_details ?? null,
        status: "open",
        created_at: now,
        updated_at: now,
      });
      persistStore(store);
      return { data: id, error: null };
    }

    case "block_user": {
      const blockedId = String(args.p_blocked_id ?? "");
      if (currentUserId && blockedId) {
        const blocks = table(store, "user_blocks");
        const exists = blocks.some(
          (b) => b.blocker_id === currentUserId && b.blocked_id === blockedId,
        );
        if (!exists) {
          blocks.push({
            blocker_id: currentUserId,
            blocked_id: blockedId,
            created_at: now,
          });
          persistStore(store);
        }
      }
      return { data: true, error: null };
    }

    case "unblock_user": {
      const blockedId = String(args.p_blocked_id ?? "");
      store.tables.user_blocks = table(store, "user_blocks").filter(
        (b) => !(b.blocker_id === currentUserId && b.blocked_id === blockedId),
      );
      persistStore(store);
      return { data: true, error: null };
    }

    case "submit_contact_message": {
      const id = randomUUID();
      table(store, "contact_messages").push({
        id,
        name: args.p_name,
        email: args.p_email,
        topic: args.p_topic,
        message: args.p_message,
        created_at: now,
      });
      persistStore(store);
      return { data: id, error: null };
    }

    default:
      return { data: null, error: null };
  }
}

export interface MemoryCookieAdapter {
  getSessionToken(): string | null;
  setSessionToken(token: string | null): void;
}

export function createMemorySupabaseClient(cookieAdapter?: MemoryCookieAdapter): AppSupabaseClient {
  assertMemoryBackendAllowed();
  const store = getStore();

  const resolveCurrentUserId = (): string | null => {
    const token = cookieAdapter?.getSessionToken() ?? null;
    if (!token) return null;
    const session = store.sessionsByToken[tokenKey(token)];
    if (!session || typeof session === "string") return null;
    if (session.expiresAt < Date.now()) {
      delete store.sessionsByToken[tokenKey(token)];
      persistStore(store);
      return null;
    }
    return store.authUsersById[session.userId] ? session.userId : null;
  };

  const issueSessionForUser = (user: AuthUserRecord) => {
    // 256-bit random token; only its hash is stored, so the store file cannot be replayed.
    const token = randomBytes(32).toString("base64url");
    store.sessionsByToken[tokenKey(token)] = { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS };
    persistStore(store);
    cookieAdapter?.setSessionToken(token);
    return {
      access_token: token,
      refresh_token: token,
      expires_in: 60 * 60 * 24 * 30,
      token_type: "bearer",
      user: {
        id: user.id,
        email: user.email,
        user_metadata: { full_name: user.fullName },
        app_metadata: { provider: "email" },
        aud: "authenticated",
        created_at: user.createdAt,
      },
    };
  };

  const client = {
    auth: {
      async getClaims() {
        const userId = resolveCurrentUserId();
        if (!userId) {
          return { data: null, error: null };
        }
        const user = store.authUsersById[userId];
        return {
          data: {
            claims: {
              sub: userId,
              email: user?.email,
              role: "authenticated",
            },
          },
          error: null,
        };
      },

      async getUser() {
        const userId = resolveCurrentUserId();
        if (!userId) {
          return { data: { user: null }, error: null };
        }
        const user = store.authUsersById[userId];
        if (!user) return { data: { user: null }, error: null };
        return {
          data: {
            user: {
              id: user.id,
              email: user.email,
              user_metadata: { full_name: user.fullName },
            },
          },
          error: null,
        };
      },

      async getSession() {
        const userId = resolveCurrentUserId();
        if (!userId) return { data: { session: null }, error: null };
        const user = store.authUsersById[userId];
        if (!user) return { data: { session: null }, error: null };
        return {
          data: { session: issueSessionForUser(user) },
          error: null,
        };
      },

      async signUp(params: {
        email: string;
        password: string;
        options?: { data?: { full_name?: string } };
      }) {
        if (store.authUserIdByEmail[params.email.trim().toLowerCase()]) {
          return {
            data: { user: null, session: null },
            error: new AuthApiError("User already registered", 422, "user_already_exists"),
          };
        }
        const user = ensureUserProvisioned(store, {
          email: params.email,
          password: params.password,
          fullName: params.options?.data?.full_name,
        });
        const session = issueSessionForUser(user);
        return {
          data: {
            user: session.user,
            session,
          },
          error: null,
        };
      },

      async signInWithPassword(params: { email: string; password: string }) {
        const normalizedEmail = params.email.trim().toLowerCase();
        const existingId = store.authUserIdByEmail[normalizedEmail];
        const existingUser = existingId ? store.authUsersById[existingId] : undefined;
        // Same generic answer (and the same scrypt cost) for unknown e-mails and wrong passwords.
        if (!verifyPassword(params.password, existingUser?.passwordHash) || !existingUser) {
          return {
            data: { user: null, session: null },
            error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
          };
        }
        const user = existingUser;

        const session = issueSessionForUser(user);
        return {
          data: {
            user: session.user,
            session,
          },
          error: null,
        };
      },

      async signOut() {
        const token = cookieAdapter?.getSessionToken() ?? null;
        if (token) {
          delete store.sessionsByToken[tokenKey(token)];
          persistStore(store);
        }
        cookieAdapter?.setSessionToken(null);
        return { error: null };
      },

      async resetPasswordForEmail() {
        return { data: {}, error: null };
      },

      async resend() {
        return { data: {}, error: null };
      },

      async updateUser(attributes: { password?: string; data?: { full_name?: string } }) {
        const userId = resolveCurrentUserId();
        const user = userId ? store.authUsersById[userId] : undefined;
        if (!user) {
          return { data: { user: null }, error: null };
        }
        if (attributes.password) {
          user.passwordHash = hashPassword(attributes.password);
          // A password change signs out every other session of this account.
          const current = cookieAdapter?.getSessionToken();
          for (const [key, value] of Object.entries(store.sessionsByToken)) {
            if (typeof value !== "string" && value.userId === user.id && key !== (current ? tokenKey(current) : "")) {
              delete store.sessionsByToken[key];
            }
          }
        }
        if (attributes.data?.full_name) {
          user.fullName = attributes.data.full_name;
        }
        persistStore(store);
        return {
          data: {
            user: {
              id: user.id,
              email: user.email,
              user_metadata: { full_name: user.fullName },
            },
          },
          error: null,
        };
      },

      async exchangeCodeForSession() {
        return { data: { session: null, user: null }, error: null };
      },

      async verifyOtp() {
        return { data: { session: null, user: null }, error: null };
      },
    },

    from(tableName: string) {
      return new MemoryQueryBuilder(store, tableName);
    },

    async rpc(fn: string, args?: Record<string, unknown>) {
      return executeRpc(store, resolveCurrentUserId(), fn, args ?? {});
    },

    storage: {
      from(bucket: string) {
        if (!store.storage[bucket]) {
          store.storage[bucket] = {};
        }
        return {
          async upload(path: string) {
            const bucketMap = store.storage[bucket] ?? (store.storage[bucket] = {});
            bucketMap[path] =
              "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80";
            persistStore(store);
            return { data: { path }, error: null };
          },
          async remove(paths: string[]) {
            const bucketMap = store.storage[bucket];
            if (bucketMap) {
              for (const p of paths) {
                delete bucketMap[p];
              }
            }
            persistStore(store);
            return { data: paths.map((name) => ({ name })), error: null };
          },
          async list() {
            return { data: [], error: null };
          },
          async createSignedUrls(paths: string[]) {
            return {
              data: paths.map((p) => ({
                path: p,
                signedUrl:
                  store.storage[bucket]?.[p] ??
                  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80",
                error: null,
              })),
              error: null,
            };
          },
          getPublicUrl(path: string) {
            return {
              data: {
                publicUrl:
                  store.storage[bucket]?.[path] ??
                  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80",
              },
            };
          },
        };
      },
    },
  };

  return client as unknown as AppSupabaseClient;
}
