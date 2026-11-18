/**
 * The address that receives every contact message, feedback note and visit request, and the rule
 * that nobody may type it as their own (sender) address. Messages are delivered TO this inbox with
 * the visitor as Reply-To; if the inbox owner's own address were accepted as a sender, the message
 * would loop back to the owner and the "reply" would go nowhere.
 *
 * Pure functions, no environment access, so they are trivially testable. `contactInbox()` in
 * `./index.ts` adds the CONTACT_INBOX override on top of this default.
 */
export const OWNER_INBOX = "sayan.bh.work@gmail.com";

/**
 * Reduces an address to the mailbox it really delivers to, so the same inbox cannot be typed in
 * a different spelling. Gmail ignores dots and everything after "+" in the local part and treats
 * googlemail.com as gmail.com; for every other domain only case and surrounding spaces are
 * normalised (other providers may treat dots and plus-tags as significant).
 */
export function canonicalEmail(address: string): string {
  const value = address.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1) return value;
  let local = value.slice(0, at);
  let domain = value.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = (local.split("+")[0] ?? "").replaceAll(".", "");
  return `${local}@${domain}`;
}

/** True when `address` is the owner inbox or any of the extra inboxes passed in (same mailbox, any spelling). */
export function isOwnInbox(address: string, ...extraInboxes: string[]): boolean {
  const target = canonicalEmail(address);
  return [OWNER_INBOX, ...extraInboxes].some((own) => own.trim() !== "" && canonicalEmail(own) === target);
}
