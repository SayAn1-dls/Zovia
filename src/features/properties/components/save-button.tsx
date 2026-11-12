"use client";

import { Heart, Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { useSession } from "@/components/session/session-context";
import { isApiError } from "@/lib/api/client";
import { signInHref } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import { useSavedIds, useToggleSaved } from "../queries";

/**
 * Heart toggle. Saved state loads in the browser (/api/v1/me/saved-properties/ids), so public
 * pages stay cacheable. Signed out, a press goes to sign-in and comes back here.
 */
export function SaveButton({
  propertyId,
  title,
  variant = "overlay",
  onChange,
  className,
}: {
  propertyId: string;
  title: string;
  /** "overlay": round button on a photo; "inline": pill with a label. */
  variant?: "overlay" | "inline";
  /** Called after a successful change (e.g. to refresh the saved list). */
  onChange?: (saved: boolean) => void;
  className?: string;
}) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const saved = useSavedIds();
  const toggle = useToggleSaved();
  const isSaved = saved.data?.has(propertyId) ?? false;
  const busy = toggle.isPending || (session.isSignedIn && saved.isPending);

  function onClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (session.isLoading) return;
    if (!session.isSignedIn) {
      router.push(signInHref(pathname));
      return;
    }
    const next = !isSaved;
    toggle.mutate(
      { propertyId, save: next },
      {
        onSuccess: () => {
          toast.success(next ? "Saved" : "Removed from saved");
          onChange?.(next);
        },
        onError: (error) => toast.error(isApiError(error) ? error.message : "That did not work. Please try again."),
      },
    );
  }

  const label = isSaved ? `Remove ${title} from saved` : `Save ${title}`;
  const icon = busy && toggle.isPending ? (
    <Loader2 className="size-5 animate-spin" aria-hidden />
  ) : (
    <Heart className={cn("size-5", isSaved && "fill-coral text-coral")} aria-hidden />
  );

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isSaved}
        aria-label={label}
        disabled={toggle.isPending}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-full border border-foreground/25 bg-card px-4 text-sm font-semibold transition-colors hover:border-foreground disabled:opacity-60",
          className,
        )}
      >
        {icon}
        {isSaved ? "Saved" : "Save"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSaved}
      aria-label={label}
      title={isSaved ? "Saved" : "Save"}
      disabled={toggle.isPending}
      className={cn(
        "flex size-11 items-center justify-center rounded-full bg-card/90 text-foreground shadow-md backdrop-blur transition-transform hover:scale-105 disabled:opacity-60",
        className,
      )}
    >
      {icon}
    </button>
  );
}
