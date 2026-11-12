"use client";

import { Images } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type { PropertyPhoto as Photo } from "../schemas";
import { NoPhotos, PropertyPhoto } from "./property-photo";

/**
 * The owner's photos only (spec 14.4): one large and up to four small on desktop, a swipeable
 * strip on phones, and every photo in a dialog. No photos -> a neutral "No photos yet" panel.
 */
export function PhotoGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [open, setOpen] = useState(false);

  if (photos.length === 0) {
    return (
      <div className="aspect-[16/9] overflow-hidden rounded-3xl ring-1 ring-border sm:aspect-[21/9]">
        <NoPhotos />
      </div>
    );
  }

  const [first, ...rest] = photos;
  const side = rest.slice(0, 4);

  return (
    <div className="relative">
      {/* Phones: horizontal scroll-snap strip. */}
      <ul
        className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1 sm:hidden"
        aria-label={`Photos of ${title}`}
      >
        {photos.map((photo, index) => (
          <li key={photo.id} className="relative aspect-[4/3] w-[85%] shrink-0 snap-center overflow-hidden rounded-2xl bg-muted">
            <PropertyPhoto src={photo.url} alt={photo.alt} sizes="85vw" preload={index === 0} />
          </li>
        ))}
      </ul>

      {/* Tablet and up: mosaic. */}
      <div
        className={cn(
          "hidden h-[22rem] gap-2 overflow-hidden rounded-3xl sm:grid lg:h-[28rem]",
          side.length > 0 ? "grid-cols-4 grid-rows-2" : "grid-cols-1",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn("relative bg-muted", side.length > 0 ? "col-span-2 row-span-2" : "")}
          aria-label={`Open all ${photos.length} photos`}
        >
          <PropertyPhoto src={first!.url} alt={first!.alt} sizes="(min-width: 1024px) 50vw, 60vw" preload />
        </button>
        {side.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setOpen(true)}
            className={cn("relative bg-muted", side.length < 3 && "row-span-2", side.length === 3 && index === 0 && "row-span-2")}
            aria-label={`Open all ${photos.length} photos`}
          >
            <PropertyPhoto src={photo.url} alt={photo.alt} sizes="25vw" />
          </button>
        ))}
      </div>

      {photos.length > 1 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="absolute right-3 bottom-3 inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-sm font-semibold shadow-md ring-1 ring-border max-sm:hidden"
        >
          <Images className="size-4" aria-hidden />
          Show all {photos.length} photos
        </button>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Photos</DialogTitle>
            <DialogDescription>{photos.length} photos uploaded by the owner.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-3 sm:grid-cols-2">
            {photos.map((photo) => (
              <li key={photo.id} className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                <PropertyPhoto src={photo.url} alt={photo.alt} sizes="(min-width: 640px) 45vw, 90vw" />
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
