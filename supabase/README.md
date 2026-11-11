# Local Supabase stack

Real Postgres 17 + Auth + REST + Realtime + Storage in Docker, for local development and for the
integration and end-to-end tests. Configured by `supabase/config.toml` (project id `zuvio`).
Everything here is local only: nothing in this folder talks to a hosted project.

Requires Docker Desktop to be running. Commands below use Supabase CLI 3.1.0 and are run from the
repo root. `pnpm exec supabase ...` works too once the CLI is installed as a dev dependency.

## Start, stop, reset

```sh
# Start (first run pulls images and takes several minutes)
pnpm dlx supabase@3.1.0 start --exclude studio,postgres-meta,imgproxy,edge-runtime,logflare,vector,supavisor

# URLs and keys of the running stack (add `-o env` for KEY="value" lines)
pnpm dlx supabase@3.1.0 status

# Stop. Data is kept in Docker volumes and comes back on the next start.
pnpm dlx supabase@3.1.0 stop

# Stop and delete all local data (database, storage objects)
pnpm dlx supabase@3.1.0 stop --no-backup

# Recreate the database from supabase/migrations, then run supabase/seed.sql if it exists
pnpm dlx supabase@3.1.0 db reset

# Generate TypeScript types from the local database (prints to stdout; local is the default target)
pnpm dlx supabase@3.1.0 gen types --lang typescript
```

Changes to `config.toml` only take effect after a stop followed by the start command above.

## What runs and what is left out

Running (7 containers, roughly 700 MiB of RAM when idle):

| Container                 | Service                      |
| ------------------------- | ---------------------------- |
| `supabase_db_zuvio`       | Postgres 17.11               |
| `supabase_auth_zuvio`     | Auth (GoTrue)                |
| `supabase_rest_zuvio`     | REST (PostgREST)             |
| `supabase_realtime_zuvio` | Realtime                     |
| `supabase_storage_zuvio`  | Storage API                  |
| `supabase_kong_zuvio`     | API gateway on port 54321    |
| `supabase_inbucket_zuvio` | Mail catcher (Mailpit)       |

Left out with `--exclude`, because the development machine has 8 GB of RAM and none of these are
needed by the app or the tests:

| Excluded name   | What it is                    | Why it is not needed                                                    |
| --------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `studio`        | Supabase Studio dashboard     | Optional UI; see "Starting Studio" below                                |
| `postgres-meta` | Metadata API used by Studio   | Only Studio needs it; `gen types` and `db reset` connect to Postgres directly |
| `imgproxy`      | Storage image transformations | Image transformation is not used                                        |
| `edge-runtime`  | Deno Edge Functions runtime   | No Edge Functions; also `enabled = false` in config.toml                |
| `logflare`      | Analytics / log store         | Also `[analytics] enabled = false`; use `docker logs supabase_<service>_zuvio` |
| `vector`        | Log shipper for analytics     | Same as above                                                           |
| `supavisor`     | Connection pooler             | App and tests connect straight to Postgres; also `[db.pooler] enabled = false` |

`supabase status` prints a "Stopped services" line listing these; that is expected.

## Ports

| Port  | What                                                                  |
| ----- | --------------------------------------------------------------------- |
| 54321 | API gateway: `/auth/v1`, `/rest/v1`, `/storage/v1`, `/realtime/v1`, `/graphql/v1` |
| 54322 | Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`   |
| 54323 | Studio (only when started, see below)                                 |
| 54324 | Mail catcher web UI and HTTP API                                      |
| 54320 | Shadow database, used briefly by `db diff`                            |

Quick health checks:

```sh
curl http://127.0.0.1:54321/auth/v1/health        # {"version":"v2.197.0","name":"GoTrue",...}
curl http://127.0.0.1:54321/rest/v1/               # OpenAPI document of the public schema
curl http://127.0.0.1:54321/storage/v1/status      # HTTP 200
curl http://127.0.0.1:54324/api/v1/info            # Mailpit version and message counts
docker exec supabase_db_zuvio psql -U postgres -c 'select version()'
```

## Keys

`supabase status` prints two interchangeable sets of local keys, and both were checked against
Auth, REST, Storage and Realtime:

- new format: `PUBLISHABLE_KEY` (`sb_publishable_...`) and `SECRET_KEY` (`sb_secret_...`)
- legacy JWTs: `ANON_KEY` and `SERVICE_ROLE_KEY` (`eyJ...`)

The repo-root `.env.local` uses the new format: `NEXT_PUBLIC_SUPABASE_ANON_KEY` holds the
publishable key and `SUPABASE_SERVICE_ROLE_KEY` holds the secret key. These are the CLI's fixed
local-development keys, identical on every machine, and are useless against a hosted project.

User access tokens issued by local Auth are signed with ES256 (asymmetric, with a `kid`), not
with the legacy HS256 JWT secret. Verify them through Auth (`getUser` / `getClaims`), not with
the `JWT_SECRET` value.

## Auth settings worth knowing

- Email confirmation is ON. A signup returns no session; the user must follow the emailed link
  before password sign-in works (before that Auth answers HTTP 400 `email_not_confirmed`).
- Passwords need at least 8 characters with both letters and digits (HTTP 422 `weak_password`).
- Rate limits and the minimum interval between emails are raised/lowered for local use only so
  tests are not throttled. Production keeps the hosted defaults.
- Google sign-in is present but disabled; the comment above `[auth.external.google]` in
  config.toml explains how to enable it. Phone/SMS sign-in is disabled.

## Reading local emails

No email leaves the machine. Everything Auth sends (signup confirmation, password reset, email
change) is caught by Mailpit:

- Web UI: http://127.0.0.1:54324
- HTTP API, no authentication, base URL `http://127.0.0.1:54324`. Verified paths:

| Request                                           | Returns                                                         |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `GET /api/v1/messages?limit=50`                   | Newest-first summaries: `messages[]` with `ID`, `Subject`, `To`, `From` |
| `GET /api/v1/search?query=to:user@example.com`    | Same shape, filtered (Mailpit search syntax, URL-encode the query) |
| `GET /api/v1/message/{ID}`                        | Full message as JSON, including `HTML` and `Text` bodies         |
| `GET /api/v1/message/latest?query=to:user@example.com` | The newest matching message, same JSON as above             |
| `GET /view/{ID}.html` and `GET /view/{ID}.txt`    | The raw HTML or plain-text body                                  |
| `DELETE /api/v1/search?query=to:user@example.com` | Deletes the matching messages                                    |
| `GET /api/v1/info`, `GET /livez`, `GET /readyz`   | Version/counters and health probes                               |

Typical test flow: sign up, poll `GET /api/v1/search?query=to:<email>` until a message appears,
fetch `GET /api/v1/message/{ID}`, and take the link from the `HTML` body. It looks like
`http://127.0.0.1:54321/auth/v1/verify?token=...&type=signup&redirect_to=...`; in the JSON `HTML`
field the `&` characters are encoded as `&amp;`, so decode them before requesting the link.
Requesting it answers HTTP 303 to the `redirect_to` URL.

The default email templates contain a link only, no 6-digit code. Tests that need an OTP in the
email must add a custom template that prints `{{ .Token }}` (see the commented
`[auth.email.template.*]` block in config.toml).

Caught messages are not kept across a stop/start of the stack (the Mailpit container is recreated).

## Starting Studio

Studio needs `postgres-meta` as well. Stop the stack and start it again without those two names
in the exclude list:

```sh
pnpm dlx supabase@3.1.0 stop
pnpm dlx supabase@3.1.0 start --exclude imgproxy,edge-runtime,logflare,vector,supavisor
```

Then open http://127.0.0.1:54323. The first time this pulls two more images. To go back to the
lean stack, stop and use the normal start command from the top of this file. Without Studio, use
`docker exec -it supabase_db_zuvio psql -U postgres` or any SQL client on port 54322.

## Database extensions

Available in the local Postgres image (check with `select * from pg_available_extensions`):
postgis 3.3.7, pg_trgm 1.6, pgcrypto 1.3 (already installed), pg_cron 1.6.4, pgtap 1.3.3,
unaccent 1.1, btree_gist 1.7, pg_net 0.20.4, citext 1.6. Apart from pgcrypto they are not
installed by default; enable the ones the schema needs in a migration with
`create extension if not exists ... with schema extensions;`.

## Files in this folder

- `config.toml`: stack configuration, committed.
- `migrations/`, `seed.sql`: do not exist yet; the schema is added separately.
- `.temp/`, `.branches/`: CLI working state, git-ignored by `supabase/.gitignore`.
