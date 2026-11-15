import "server-only";

/**
 * Developer-only staff access.
 *
 * Admin and moderator powers count ONLY for accounts whose e-mail is on this server-side allowlist
 * (ADMIN_EMAILS, comma separated; default: the developer's address). A staff role in the database
 * alone is not enough, so a role granted by mistake, or by anyone who gets write access to
 * `user_roles`, opens nothing. The list never reaches the browser.
 */
const DEFAULT_DEVELOPER_EMAILS = "sayanbhattacharya2024@gmail.com";

export function developerEmails(): ReadonlySet<string> {
  const raw = process.env.ADMIN_EMAILS?.trim() || DEFAULT_DEVELOPER_EMAILS;
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.includes("@")),
  );
}

export function isDeveloperEmail(email: string | null | undefined): boolean {
  return Boolean(email) && developerEmails().has(email!.trim().toLowerCase());
}

const STAFF_ROLES = new Set(["admin", "moderator"]);

/** Drops staff roles from anyone who is not on the developer allowlist. */
export function restrictStaffRoles<R extends string>(
  roles: readonly R[],
  email: string | null | undefined,
): R[] {
  return isDeveloperEmail(email)
    ? [...roles]
    : roles.filter((role) => !STAFF_ROLES.has(role));
}
