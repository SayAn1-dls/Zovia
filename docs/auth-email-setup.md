# Auth e-mail setup (hosted Supabase)

Why: the default sign-up and reset links carry a PKCE `?code=` that only works in the browser that
asked for the e-mail. Opening the e-mail on a phone while you signed up on a laptop fails. The
templates in `supabase/templates/` use token-hash links (`/auth/confirm?token_hash=...&type=...`),
which `src/app/auth/confirm/route.ts` verifies in any browser. Locally, `supabase/config.toml`
already points at these files. The hosted project needs the steps below once.

## 1. Paste the templates

Supabase dashboard > your project > Authentication > Emails (older UI: Email Templates).
For each tab, set the subject and replace the body with the file's HTML (use the "Source" view):

| Tab | Subject | File |
|---|---|---|
| Confirm sign up | Confirm your Zovia e-mail | `supabase/templates/confirmation.html` |
| Reset password | Reset your Zovia password | `supabase/templates/recovery.html` |
| Magic link | Your Zovia sign-in link | `supabase/templates/magic_link.html` |
| Change e-mail address | Confirm your new Zovia e-mail | `supabase/templates/email_change.html` |
| Invite user | You are invited to Zovia | `supabase/templates/invite.html` |

Click Save on each tab. Keep `{{ .SiteURL }}` and `{{ .TokenHash }}` exactly as written.

## 2. Site URL and Redirect URLs

Authentication > URL Configuration:

1. Site URL: `https://zovia-chi.vercel.app` (no trailing slash). Templates build links from it.
2. Redirect URLs > Add URL, one per line:
   - `https://zovia-chi.vercel.app/**`
   - `http://localhost:3000/**`
   - `http://127.0.0.1:3000/**`
3. Save.

Also set `NEXT_PUBLIC_SITE_URL=https://zovia-chi.vercel.app` in Vercel (Project > Settings >
Environment Variables) and redeploy.

## 3. Custom SMTP (needed for real users)

The built-in sender allows only a few e-mails an hour and only to addresses of your Supabase team
members. Everyone else gets nothing, and the app shows "We can't send verification e-mails right
now". Set up your own SMTP:

### Option A: Resend SMTP

1. resend.com > Domains > Add domain, add the DNS records, wait for "Verified". (Without a verified
   domain Resend can only send to your own address.)
2. Resend > API Keys > Create API key (Sending access). Copy it.
3. Supabase > Authentication > Emails > SMTP Settings > turn on "Enable custom SMTP".
4. Fill in: Host `smtp.resend.com`, Port `465`, Username `resend`, Password = the API key,
   Sender e-mail `no-reply@your-verified-domain`, Sender name `Zovia`.
5. Save.

### Option B: Gmail (testing only, about 500 mails a day)

1. Google account > Security > turn on 2-Step Verification, then App passwords > create one for "Mail".
2. Supabase SMTP Settings: Host `smtp.gmail.com`, Port `465`, Username your Gmail address,
   Password the 16-character app password, Sender e-mail the same Gmail address, Sender name `Zovia`.

### Option C: Brevo

1. brevo.com > SMTP & API > SMTP tab > Generate a new SMTP key.
2. Supabase SMTP Settings: Host `smtp-relay.brevo.com`, Port `587`, Username your Brevo login,
   Password the SMTP key, Sender e-mail a sender you verified in Brevo, Sender name `Zovia`.

After saving SMTP, open Authentication > Rate Limits and raise "Rate limit for sending emails"
(it starts at 30 per hour once custom SMTP is on).

## 4. Check it

1. Sign up on the live site with an address that is not on your team.
2. Open the e-mail on a different device from the one you signed up on.
3. The button goes to `https://zovia-chi.vercel.app/auth/confirm?token_hash=...&type=signup`, then
   into the app. Do the same with Forgot password: it must land on the reset form.

Notes: sign-up links do not carry a `next` page (the app sends new users to their usual start
page). The e-mail-change template uses the single-address token; if you enable "Secure email
change", the confirmation sent to the old address uses the same link shape.
