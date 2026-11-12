"use client";

import { ArrowLeft, ArrowRight, ImageOff, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { ImageUploader, type UploadFn } from "@/components/image-uploader/image-uploader";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import { deleteMediaAction, discardUploadAction, registerMediaAction, reorderMediaAction, setCoverAction } from "../actions";
import { PROPERTY_MEDIA_MAX_BYTES, PROPERTY_MEDIA_MAX_COUNT, type OwnerMedia } from "../schemas";

const BUCKET = "property-media";

/**
 * Photos of a listing. The browser resizes each image to WebP (ImageUploader), uploads it
 * straight to Storage at `property-media/<property_id>/<uuid>.webp` — the bucket policy accepts
 * it only from this property's owner — and then asks the server to record the row.
 */
export function PhotosEditor({ propertyId, media }: { propertyId: string; media: OwnerMedia[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const upload = useCallback<UploadFn<OwnerMedia>>(
    async (file, { width, height, signal }) => {
      const path = `${propertyId}/${crypto.randomUUID()}.webp`;
      const storage = getSupabaseBrowserClient().storage.from(BUCKET);
      const { error } = await storage.upload(path, file, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
      if (error) {
        throw new Error(/security|policy|unauthori|403/i.test(error.message) ? "You can only add photos to your own listing." : "Upload failed. Check your connection and try again.");
      }
      if (signal.aborted) {
        await discardUploadAction({ property_id: propertyId, storage_path: path });
        throw new Error("Upload cancelled.");
      }
      const result = await registerMediaAction({ property_id: propertyId, storage_path: path, width, height, size_bytes: file.size });
      if (!result.ok) {
        await discardUploadAction({ property_id: propertyId, storage_path: path });
        throw new Error(result.error.message);
      }
      return result.data;
    },
    [propertyId],
  );

  const onUploaded = useCallback(() => router.refresh(), [router]);

  function run(task: () => Promise<{ ok: boolean; error?: { message: string } }>, success: string) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        toast.error(result.error?.message ?? "That did not work.");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  function move(index: number, delta: number) {
    const ids = media.map((item) => item.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    run(() => reorderMediaAction({ property_id: propertyId, media_ids: ids }), "Order saved");
  }

  const remaining = Math.max(0, PROPERTY_MEDIA_MAX_COUNT - media.length);

  return (
    <div className="space-y-6">
      {media.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Photos">
          {media.map((item, index) => (
            <li key={item.id} className="overflow-hidden rounded-2xl bg-card ring-1 ring-border" data-testid="photo">
              <div className="relative aspect-[4/3] bg-muted">
                {/* Owner's own upload from the public bucket. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.alt_text ?? `Photo ${index + 1}`} className="size-full object-cover" loading="lazy" />
                {item.is_cover ? (
                  <span className="absolute top-2 left-2 rounded-full bg-lime px-2.5 py-1 text-xs font-semibold text-ink">Cover</span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1 p-1.5">
                <div className="flex">
                  <Button variant="ghost" size="icon-lg" aria-label={`Move photo ${index + 1} earlier`} disabled={pending || index === 0} onClick={() => move(index, -1)}>
                    <ArrowLeft aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Move photo ${index + 1} later`}
                    disabled={pending || index === media.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowRight aria-hidden />
                  </Button>
                </div>
                <div className="flex">
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label={item.is_cover ? `Photo ${index + 1} is the cover` : `Make photo ${index + 1} the cover`}
                    aria-pressed={item.is_cover}
                    disabled={pending || item.is_cover}
                    onClick={() => run(() => setCoverAction({ media_id: item.id }), "Cover photo updated")}
                  >
                    <Star className={item.is_cover ? "fill-current" : undefined} aria-hidden />
                  </Button>
                  <ConfirmDialog
                    title="Delete this photo?"
                    description="It is removed from the listing and from storage."
                    confirmLabel="Delete photo"
                    destructive
                    onConfirm={async () => {
                      const result = await deleteMediaAction({ media_id: item.id });
                      if (!result.ok) throw new Error(result.error.message);
                      toast.success("Photo deleted");
                      router.refresh();
                    }}
                    trigger={
                      <Button variant="ghost" size="icon-lg" aria-label={`Delete photo ${index + 1}`} disabled={pending}>
                        <Trash2 aria-hidden />
                      </Button>
                    }
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={ImageOff} title="No photos yet" description="Listings with clear, real photos get far more enquiries. Add at least one." />
      )}
      <ImageUploader
        upload={upload}
        onUploaded={onUploaded}
        maxBytes={PROPERTY_MEDIA_MAX_BYTES}
        maxFiles={Math.min(10, remaining)}
        disabled={remaining === 0}
        label="Add photos"
        hint={`Real photos of this property only. JPEG, PNG or WebP; resized in your browser. ${remaining} of ${PROPERTY_MEDIA_MAX_COUNT} left.`}
      />
    </div>
  );
}
