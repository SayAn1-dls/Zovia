"use client";

import { Heart, HeartOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/feedback/empty-state";
import { Pagination } from "@/components/pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { isApiError } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { routes, withQuery } from "@/lib/navigation";

import { useToggleSaved } from "../queries";
import type { SavedPropertyItem } from "../schemas";
import { PropertyCard } from "./property-card";

/** The saved grid. Unsaving refreshes the server-rendered list; unavailable listings can be removed. */
export function SavedList({
  items,
  page,
  totalPages,
}: {
  items: SavedPropertyItem[];
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const toggle = useToggleSaved();
  const refresh = () => startRefresh(() => router.refresh());

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title={page > 1 ? "Nothing on this page" : "No saved places yet"}
        description="Tap the heart on any listing to keep it here."
        action={
          <Link href={routes.search} className={buttonVariants({ size: "lg" })}>
            Find a home
          </Link>
        }
      />
    );
  }

  return (
    <div aria-busy={refreshing} className={refreshing ? "opacity-70 transition-opacity" : undefined}>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) =>
          item.property ? (
            <li key={item.property_id}>
              <PropertyCard property={item.property} onSavedChange={(saved) => (saved ? undefined : refresh())} />
            </li>
          ) : (
            <li key={item.property_id} className="flex flex-col justify-between gap-4 rounded-2xl bg-muted p-5">
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  <HeartOff className="size-4" aria-hidden />
                  No longer listed
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The owner paused or removed this listing. Saved {formatDate(item.saved_at)}.
                </p>
              </div>
              <Button
                variant="outline"
                size="lg"
                disabled={toggle.isPending}
                onClick={() =>
                  toggle.mutate(
                    { propertyId: item.property_id, save: false },
                    {
                      onSuccess: refresh,
                      onError: (error) => toast.error(isApiError(error) ? error.message : "That did not work."),
                    },
                  )
                }
              >
                {toggle.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Remove
              </Button>
            </li>
          ),
        )}
      </ul>
      <Pagination
        className="mt-8"
        page={page}
        totalPages={totalPages}
        hrefForPage={(p) => withQuery(routes.saved, { page: p > 1 ? p : undefined })}
      />
    </div>
  );
}
