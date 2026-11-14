import { type VariantProps } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/** WhatsApp glyph (lucide has no brand icons). */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-4", className)}
      fill="currentColor"
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23-1.48 0-2.93-.39-4.19-1.15l-.3-.17-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.25 8.24-8.25ZM8.53 7.33c-.16 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.16-.48-.29-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.78.97-.15.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.46Z" />
    </svg>
  );
}

type ButtonStyle = Pick<VariantProps<typeof buttonVariants>, "variant" | "size">;

type WhatsAppShareButtonProps = ButtonStyle & {
  /** Message text; the URL is appended on its own line. */
  text: string;
  /** Absolute URL to share. */
  url: string;
  label?: string;
  className?: string;
};

/** Builds a wa.me share link. Exported for tests and for custom triggers. */
export function whatsappShareHref(text: string, url: string): string {
  const message = [text.trim(), url.trim()].filter(Boolean).join("\n");
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Share-to-WhatsApp link. Needs no configuration, so it always works: it
 * opens WhatsApp with the text and URL pre-filled and lets the user pick the
 * chat.
 */
export function WhatsAppShareButton({
  text,
  url,
  label = "Share on WhatsApp",
  variant = "outline",
  size = "lg",
  className,
}: WhatsAppShareButtonProps) {
  return (
    <a
      href={whatsappShareHref(text, url)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant, size }), className)}
    >
      <WhatsAppIcon className="text-[#128C4B]" />
      {label}
    </a>
  );
}

type WhatsAppSupportButtonProps = ButtonStyle & {
  /** Pre-filled message for the support chat. */
  message?: string;
  label?: string;
  className?: string;
};

/** wa.me link to the configured support number, or null when it is not configured. */
export function whatsappSupportHref(message?: string): string | null {
  if (!site.whatsappNumber) return null;
  const query = message?.trim()
    ? `?text=${encodeURIComponent(message.trim())}`
    : "";
  return `https://wa.me/${site.whatsappNumber}${query}`;
}

/**
 * Chat-with-support link. Renders NOTHING unless NEXT_PUBLIC_WHATSAPP_NUMBER
 * is set: a number is never invented.
 */
export function WhatsAppSupportButton({
  message = "Hi Zovia, I need some help.",
  label = "Chat on WhatsApp",
  variant = "outline",
  size = "lg",
  className,
}: WhatsAppSupportButtonProps) {
  const href = whatsappSupportHref(message);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant, size }), className)}
    >
      <WhatsAppIcon className="text-[#128C4B]" />
      {label}
    </a>
  );
}
