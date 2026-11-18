# Contact mail: getting messages into your inbox

Everything a visitor sends (contact form, feedback, visit requests) goes to **one inbox**, set by the
`CONTACT_INBOX` variable (`sayan.bh.work@gmail.com`). The visitor's own address is the Reply-To, so
pressing Reply answers them. The visitor cannot use the inbox address as their own.

Every message is **also saved** in the site (`/admin/contact-messages`), so nothing is lost while e-mail
is not set up. The form tells the visitor honestly when the e-mail did not go out and shows the direct
address instead.

## Set up Resend (5 minutes, free, no domain needed)

This is the way to get mail delivered from the live site. The free fallback service (FormSubmit) does
**not** work from a hosted server: it answers HTTP 403 to requests that come from Vercel (seen on the
live site on 2026-11-20 as `mail_status: "http_403"`), so activating it cannot fix delivery.

Resend's free test sender can e-mail the owner of the Resend account, which is exactly this flow.

1. Go to resend.com and sign up **with `sayan.bh.work@gmail.com`** (it must be the same address).
2. API Keys, Create API Key, permission "Sending access". Copy it.
3. In Vercel, Settings, Environment Variables (Production and Preview), add:
   - `RESEND_API_KEY` = the key (type **Secret**)
   - `EMAIL_FROM` = `Zovia <onboarding@resend.dev>` (type Config)
   - check that `CONTACT_INBOX` = `sayan.bh.work@gmail.com`
4. Redeploy.

Limit of the free test sender: it can only send to `sayan.bh.work@gmail.com`. That is fine for your inbox.
E-mails to guests (booking receipts) need a verified domain; until then guests see their receipt on
the site and can use the WhatsApp button.

## How to check it works

Send a message from `/contact` with an address that is not yours. The server's answer includes
`mail_status`:

- `sent`: it reached your inbox.
- `http_403_...` or other `http_...`: Resend refused it. Check the API key and that `EMAIL_FROM` is exactly
  `Zovia <onboarding@resend.dev>` and that the Resend account e-mail equals `CONTACT_INBOX`.
- `http_403` (no suffix) or `needs_activation`: only the fallback service ran, so Resend is not set up yet.
- `not_configured`: no mail provider at all.

## Later: your own domain

Verify a domain in Resend, then set `EMAIL_FROM` to an address on it (for example
`Zovia <hello@yourdomain.in>`). Then mail can also go to guests (receipts) and to any inbox.
