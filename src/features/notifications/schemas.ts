import { z } from "zod";

import type { Database } from "@/lib/database.types";

/** Notification contracts (isomorphic). */

export type NotificationType = Database["public"]["Enums"]["notification_type"];

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationsPage = { items: NotificationItem[]; unread_count: number; has_more: boolean };

export const notificationsQuerySchema = z.object({
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unread: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});
export type NotificationsQuery = z.output<typeof notificationsQuerySchema>;

export const markReadSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500).optional(),
});
export type MarkReadInput = z.output<typeof markReadSchema>;

/** Only same-origin relative paths are ever followed (the database enforces the same rule). */
export function safeLinkPath(path: string | null): string | null {
  if (!path) return null;
  return /^\/(?!\/)[^\s\\]*$/.test(path) ? path : null;
}
