// Quick local spike test with no dependencies (Node 22+):
//   node loadtest/spike.mjs http://localhost:3000 20000 1000
// Sends TOTAL requests with CONCURRENCY in flight, mixing pages, search and booking attempts, then
// prints the status mix and latency percentiles. Crashes or 500/502/504 answers fail the run.
const [base = "http://localhost:3000", totalArg = "5000", concArg = "500"] = process.argv.slice(2);
const TOTAL = Number(totalArg);
const CONCURRENCY = Number(concArg);
// The Origin the app accepts (its NEXT_PUBLIC_SITE_URL) when testing through a load balancer.
const ORIGIN = process.env.ORIGIN ?? base;
const CITIES = ["pune", "mumbai", "bengaluru", "delhi", "kolkata", "hyderabad"];

function target(i) {
  const city = CITIES[i % CITIES.length];
  const ip = `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`; // spread like many visitors
  const kind = i % 10;
  if (kind < 4) return { url: `${base}/cities/${city}`, init: { headers: { "x-real-ip": ip } }, kind: "page" };
  if (kind < 8) return { url: `${base}/api/v1/properties/search?city=${city}&page=${(i % 3) + 1}`, init: { headers: { "x-real-ip": ip } }, kind: "search" };
  return {
    url: `${base}/api/v1/bookings`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, "x-real-ip": ip },
      body: JSON.stringify({ property_id: "00000000-0000-4000-8000-000000000000", move_in_date: "2026-12-01", stay_months: 6 }),
    },
    kind: "booking",
  };
}

const stats = new Map();
const latencies = [];
let next = 0;
const started = performance.now();

async function worker() {
  while (next < TOTAL) {
    const i = next++;
    const { url, init, kind } = target(i);
    const t0 = performance.now();
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
      await res.arrayBuffer();
      const key = `${kind} ${res.status}`;
      stats.set(key, (stats.get(key) ?? 0) + 1);
    } catch (error) {
      const key = `${kind} NETWORK_ERROR(${error.cause?.code ?? error.name})`;
      stats.set(key, (stats.get(key) ?? 0) + 1);
    }
    latencies.push(performance.now() - t0);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const seconds = (performance.now() - started) / 1000;
latencies.sort((a, b) => a - b);
const pct = (p) => Math.round(latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))]);
console.log(`${TOTAL} requests, ${CONCURRENCY} at once, ${seconds.toFixed(1)} s, ${Math.round(TOTAL / seconds)} req/s`);
console.log(`latency ms: p50 ${pct(50)}  p95 ${pct(95)}  p99 ${pct(99)}  max ${Math.round(latencies.at(-1))}`);
for (const [key, count] of [...stats.entries()].sort()) console.log(`  ${key.padEnd(34)} ${count}`);
const bad = [...stats.entries()].filter(([key]) => / (500|502|504)$|NETWORK_ERROR/.test(key)).reduce((sum, [, c]) => sum + c, 0);
console.log(bad === 0 ? "PASS: no crashes, no 500/502/504, no dropped connections" : `FAIL: ${bad} bad answers`);
process.exit(bad === 0 ? 0 : 1);
