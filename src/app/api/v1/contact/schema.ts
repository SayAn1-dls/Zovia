import { z } from "zod";

/**
 * Body of POST /api/v1/contact. Limits and formats mirror `submit_contact_message()` and the
 * constraints on `contact_messages`, so a request that passes here is not refused by the database
 * for its shape (the database still validates and is the authority).
 */
export const contactBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your name (2 to 80 characters).")
    .max(80, "Enter your name (2 to 80 characters)."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "That e-mail address is too long.")
    .regex(/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter a valid e-mail address."),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?[0-9][0-9 ()-]{5,17}[0-9])?$/, "Enter a valid phone number, or leave it empty.")
    .optional()
    .transform((value) => (value ? value : null)),
  subject: z
    .string()
    .trim()
    .min(3, "Enter a subject (3 to 150 characters).")
    .max(150, "Enter a subject (3 to 150 characters)."),
  message: z
    .string()
    .trim()
    .min(10, "Enter a message (10 to 4000 characters).")
    .max(4000, "Enter a message (10 to 4000 characters)."),
  /** Honeypot: hidden from people, so anything in it means an automated submission. */
  website: z.string().max(500).optional(),
});

export type ContactBody = z.infer<typeof contactBodySchema>;
