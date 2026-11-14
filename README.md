# Zovia

Find your space. Find your people. Zovia helps students and working professionals in India find
PGs, hostels and co-living spaces, and roommates who match how they live.

## What's inside

- **Cities** (`/cities`, `/cities/[slug]`): every tier 1 and tier 2 city (Mumbai, Delhi, Bengaluru,
  Hyderabad, Chennai, Kolkata, Pune, Ahmedabad, Gurugram, Noida, Indore, Jaipur, Lucknow, Chandigarh,
  Bhopal, Kochi, Coimbatore, Nagpur, Bhubaneswar, Dehradun, Vadodara, Surat, Visakhapatnam, Kota,
  Sonipat). Each city lists its PGs with filters for type, men / women, pure veg / non-veg, smoking,
  sharing, budget, AC, area and free beds, plus a price map.
- **PG pages** (`/properties/[slug]`): photos, about, room-wise rent and deposit, food, house rules
  (smoking, alcohol, non-veg, guests, curfew, pets), amenities, map, directions, and nearby
  restaurants, cafés, grocery stores, stations, hospitals and colleges, with a visit-request form.
- **Contact** (`/contact`): messages go to the developer's inbox with the sender as Reply-To.
- Owner portal, admin, bookings, roommate matching, messaging and an AI assistant (need Supabase).
- Installable as an app (web app manifest + service worker).

The PG catalogue lives in `src/features/catalog`. Neighbourhood coordinates and nearby places come
from OpenStreetMap (© OpenStreetMap contributors, ODbL); photos are from Wikimedia Commons (credits
on `/about#photo-credits`). Catalogue listings are marked as sample listings; owners' own listings
from the database appear alongside them.

## Run it

```bash
pnpm install
cp .env.example .env.local   # fill in at least the first three variables
pnpm dev
```

`pnpm verify` runs lint, type-check and unit tests.

## Contact form e-mail

Messages from `/contact` and PG visit requests are sent to `NEXT_PUBLIC_CONTACT_INBOX` (default
`sayanbhattacharya2024@gmail.com`) with the visitor's address as Reply-To:

1. Through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set. Until a domain is verified in
   Resend, it can only deliver to the Resend account's own address.
2. Otherwise (or if Resend fails) through [FormSubmit](https://formsubmit.co), which needs no key.
   **The very first message sends an "Activate form" e-mail to the inbox: click it once**, and
   every later message is delivered.

## Deploy (Vercel)

Import the repository in Vercel and set the environment variables from `.env.example`
(`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` at minimum).
