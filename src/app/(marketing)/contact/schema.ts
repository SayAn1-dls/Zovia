import { z } from "zod";

/**
 * Contact form contract (client side). Field names match the columns of
 * `contact_messages` (spec section 6.6): name, email, phone?, subject, message.
 * `website` is a honeypot: humans never see it, so it must stay empty; it is
 * sent as-is and the server decides what to do with a filled value.
 */
export const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your name.")
    .max(80, "Keep your name under 80 characters."),
  email: z
    .string()
    .trim()
    .min(1, "Enter your e-mail address.")
    .max(254, "That e-mail address is too long.")
    .pipe(z.email("Enter a valid e-mail address, like name@example.com.")),
  phone: z
    .string()
    .trim()
    .max(20, "That phone number is too long.")
    .refine(
      (value) => value === "" || /^\+?[0-9][0-9\s-]{6,18}$/.test(value),
      "Enter a valid phone number, or leave this blank.",
    ),
  subject: z
    .string()
    .trim()
    .min(3, "Add a short subject.")
    .max(120, "Keep the subject under 120 characters."),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more (at least 10 characters).")
    .max(2000, "Keep your message under 2,000 characters."),
  website: z.string().max(200),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

export const contactFormDefaults: ContactFormValues = {
  name: "",
  email: "",
  phone: "",
  subject: "",
  message: "",
  website: "",
};

/** JSON body for POST /api/v1/contact: an empty phone is omitted. */
export type ContactPayload = Omit<ContactFormValues, "phone"> & { phone?: string };

export function toContactPayload(values: ContactFormValues): ContactPayload {
  const { phone, ...rest } = values;
  return phone ? { ...rest, phone } : rest;
}

/** The API envelope (spec section 7), parsed defensively. */
export const apiEnvelopeSchema = z.union([
  z.object({ ok: z.literal(true), data: z.unknown().optional() }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      request_id: z.string().optional(),
    }),
  }),
]);
