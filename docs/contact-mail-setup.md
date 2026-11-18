# Contact mail: getting messages into your inbox

Everything a visitor sends (contact form, feedback, visit requests) goes to **one inbox**, set by the
`CONTACT_INBOX` variable (`sayan.bh.work@gmail.com`). The visitor's own address is the Reply-To, so
pressing Reply answers them. The visitor cannot use the inbox address as their own.

Every message is **also saved** in the site (`/admin/contact-messages`), so nothing is lost even when
e-mail is not set up. The form tells the visitor honestly when the e-mail did not go out, and shows
the direct address.

How a message is delivered, in order:

1. **Resend** (if `RESEND_API_KEY` and `EMAIL_FROM` are set): reliable and instant.
2. **FormSubmit** (no key): free, but needs a one-time activation.

## Option A (recommended): Resend, 5 minutes, free, no domain needed

Resend's free test sender can e-mail the owner of the Resend account. That is exactly this flow.

1. Go to resend.com and sign up **with `sayan.bh.work@gmail.com`** (it must be the same address).
2. API Keys, Create API Key, permission "Sending access". Copy it.
3. In Vercel, Settings, Environment Variables (Production and Preview), add:
   - `RESEND_API_KEY` = the key (type **Secret**)
   - `EMAIL_FROM` = `Zovia <onboarding@resend.dev>` (type Config)
4. Redeploy.

Limit of the free test sender: it can only send to `sayan.bh.work@gmail.com`. That is fine for your
inbox. E-mails to guests (booking receipts) need a verified domain; until then guests see their receipt
on the site and can use the WhatsApp button.

## Option B: FormSubmit, free, no account

1. Send one message from the site's contact form.
2. FormSubmit e-mails `sayan.bh.work@gmail.com` an **"Activate form"** message. Check Spam too.
3. Click the link in it once. Later messages arrive normally.

If you changed `CONTACT_INBOX`, the new address needs its own activation.

## How to check it works

Send a message from `/contact` with an address that is not yours. The response includes
`mail_status`: `sent` means it reached your inbox; `needs_activation` means Option B's link has not
been clicked yet; `not_configured` means neither option is set up.
