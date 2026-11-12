"use client";

import { Share } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

/** Shares the current page with the native share sheet, falling back to copying the link. */
export function ShareButton({ title, className }: { title: string; className?: string }) {
  async function onClick() {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this link.");
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border border-foreground/25 bg-card px-4 text-sm font-semibold transition-colors hover:border-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      <Share className="size-4" aria-hidden />
      Share
    </button>
  );
}
