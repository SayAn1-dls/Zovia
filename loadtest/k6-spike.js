// Spike test: a crowd opens the site, searches, and many try to book at the same moment.
//
//   k6 run -e BASE_URL=https://your-site.example loadtest/k6-spike.js
//   k6 cloud loadtest/k6-spike.js          # for very large numbers of virtual users
//
// Pass criteria (thresholds below): no 5xx except fast 503 load-shedding, 95% of page loads under
// 1.5 s. 429 / 409 answers are expected and correct: rate limits and "bed just taken".
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const PEAK = Number(__ENV.PEAK_VUS || 5000);

export const options = {
  scenarios: {
    browse: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: PEAK },
        { duration: "3m", target: PEAK },
        { duration: "1m", target: 0 },
      ],
      exec: "browse",
    },
    booking_rush: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.BOOKINGS_PER_SEC || 500),
      timeUnit: "1s",
      duration: "2m",
      startTime: "1m30s",
      preAllocatedVUs: 500,
      maxVUs: 5000,
      exec: "book",
    },
  },
  thresholds: {
    "http_req_duration{kind:page}": ["p(95)<1500"],
    "http_req_failed{kind:page}": ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

const CITIES = ["pune", "mumbai", "bengaluru", "delhi", "kolkata", "hyderabad", "gurugram", "indore"];

export function browse() {
  const city = CITIES[Math.floor(Math.random() * CITIES.length)];
  const page = http.get(`${BASE}/cities/${city}`, { tags: { kind: "page" } });
  check(page, { "city page ok": (r) => r.status === 200 });
  const search = http.get(`${BASE}/api/v1/properties/search?city=${city}&budget_max=12000`, { tags: { kind: "api" } });
  check(search, { "search answered (ok or rate limited)": (r) => [200, 429, 503].includes(r.status) });
  sleep(1 + Math.random() * 3);
}

export function book() {
  // Signed-out booking attempts exercise the full path up to the auth check; with test accounts
  // (COOKIE env) they reach the database lock. Either way the server must answer, not fall over.
  const headers = { "content-type": "application/json", origin: BASE };
  if (__ENV.COOKIE) headers.cookie = __ENV.COOKIE;
  const res = http.post(
    `${BASE}/api/v1/bookings`,
    JSON.stringify({ property_id: __ENV.PROPERTY_ID || "00000000-0000-4000-8000-000000000000", move_in_date: "2026-12-01", stay_months: 6, bed_id: __ENV.BED_ID }),
    { headers, tags: { kind: "booking" } },
  );
  check(res, { "booking answered in time": (r) => r.status > 0 && r.status !== 500 && r.status !== 502 && r.status !== 504 });
}
