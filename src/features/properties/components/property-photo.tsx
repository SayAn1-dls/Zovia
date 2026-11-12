import { ImageOff } from "lucide-react";
import Image, { type ImageProps } from "next/image";

import { cn } from "@/lib/utils";

/**
 * True when photos are served from a loopback Supabase (the local Docker stack). The Next.js
 * image optimiser refuses private IPs by default (`images.dangerouslyAllowLocalIP`), so locally
 * the browser loads the original object directly; in every deployed environment photos go
 * through the optimiser as usual.
 */
const STORAGE_IS_LOCAL = (() => {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
})();

/** An owner's photo of a listing (public `property-media` bucket), always `fill`. */
export function PropertyPhoto({ className, alt, ...props }: Omit<ImageProps, "fill">) {
  return <Image fill unoptimized={STORAGE_IS_LOCAL} alt={alt} className={cn("object-cover", className)} {...props} />;
}

/** Shown where a listing has no photos. Never replaced by stock imagery (spec 14.4). */
export function NoPhotos({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 bg-muted text-center text-muted-foreground",
        className,
      )}
    >
      <ImageOff className={compact ? "size-6" : "size-8"} aria-hidden />
      <span className={cn("font-medium", compact ? "text-xs" : "text-sm")}>No photos yet</span>
    </div>
  );
}
