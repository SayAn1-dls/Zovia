// Booking QA against a running Zovia with a real database (Supabase):
//   node loadtest/booking-qa.mjs http://localhost:3000 <property_id> <bed_id> [users=200]
// Creates USERS seeker accounts, then all of them book the SAME bed at the same instant.
// Exactly one booking may win; everyone else must get a clean 409 "just taken" (never a 500),
// and the database must hold exactly one live booking for that bed.
const [base, propertyId, bedId, usersArg = "200"] = process.argv.slice(2);
const USERS = Number(usersArg);
const run = Date.now().toString(36);
const moveIn = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
const json = (ip, cookie) => ({
  "content-type": "application/json",
  origin: base,
  "x-real-ip": ip,
  ...(cookie ? { cookie } : {}),
});

async function signUp(i) {
  const ip = `10.77.${i >> 8}.${i & 255}`;
  const res = await fetch(`${base}/api/v1/auth/sign-up`, {
    method: "POST",
    headers: json(ip),
    body: JSON.stringify({
      email: `qa.seeker.${run}.${i}@zovia.test`,
      password: `Seeker-${run}-${i}!`,
      full_name: `QA Seeker ${i}`,
    }),
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { ip, cookie, ok: res.ok };
}

console.log(`creating ${USERS} seekers ...`);
const users = [];
for (let i = 0; i < USERS; i += 25)
  users.push(
    ...(await Promise.all(
      Array.from({ length: Math.min(25, USERS - i) }, (_, k) => signUp(i + k)),
    )),
  );
console.log(
  `  ${users.filter((u) => u.ok && u.cookie).length}/${USERS} signed in`,
);
console.log(`rush: ${USERS} users book the same bed at once ...`);
const t0 = performance.now();
const results = await Promise.all(
  users.map(async (u) => {
    const res = await fetch(`${base}/api/v1/bookings`, {
      method: "POST",
      headers: json(u.ip, u.cookie),
      body: JSON.stringify({
        property_id: propertyId,
        bed_id: bedId,
        move_in_date: moveIn,
        stay_months: 6,
      }),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, message: body?.error?.message };
  }),
);
const ms = Math.round(performance.now() - t0);
const counts = {};
for (const r of results)
  counts[`${r.status} ${r.message ?? "created"}`] =
    (counts[`${r.status} ${r.message ?? "created"}`] ?? 0) + 1;
console.log(`  finished in ${ms} ms`);
for (const [k, v] of Object.entries(counts))
  console.log(`  ${String(v).padStart(4)} × ${k}`);
const winners = results.filter((r) => r.status === 201).length;
const crashes = results.filter((r) => r.status >= 500).length;
console.log(
  winners === 1 && crashes === 0
    ? "PASS: exactly one booking won, no server errors"
    : `FAIL: ${winners} winners, ${crashes} server errors`,
);
process.exit(winners === 1 && crashes === 0 ? 0 : 1);
