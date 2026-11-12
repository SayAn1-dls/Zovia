"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { ImageUploader, type UploadFn } from "@/components/image-uploader/image-uploader";
import { Button } from "@/components/ui/button";
import { apiFetch, isApiError } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import { ROOMMATE_PHOTO_LIMIT, ROOMMATE_PHOTO_MAX_BYTES } from "../schemas";

type Photo = { id: string; storage_path: string; url: string | null };

/**
 * Photos of the caller's roommate profile. Files go straight to the private "roommate-photos"
 * bucket under the caller's own folder (storage policy), then the server registers the path.
 */
export function PhotoManager({ userId, photos: initial }: { userId: string; photos: Photo[] }) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initial);
  const [removing, setRemoving] = useState<string | null>(null);

  const upload = useCallback<UploadFn<Photo>>(
    async (file, { signal }) => {
      const path = `${userId}/${crypto.randomUUID()}.webp`;
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.storage
        .from("roommate-photos")
        .upload(path, file, { contentType: "image/webp", upsert: false });
      if (error) throw new Error("Upload failed. Try again.");
      if (signal.aborted) throw new Error("Cancelled");
      try {
        return await apiFetch<Photo>("/roommates/photos", { method: "POST", body: { storage_path: path } });
      } catch (cause) {
        await supabase.storage.from("roommate-photos").remove([path]);
        throw new Error(isApiError(cause) ? cause.message : "Upload failed. Try again.");
      }
    },
    [userId],
  );

  async function remove(photo: Photo) {
    setRemoving(photo.id);
    try {
      await apiFetch(`/roommates/photos/${photo.id}`, { method: "DELETE" });
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
      router.refresh();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "Could not remove the photo.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="space-y-5 rounded-3xl bg-card p-5 ring-1 ring-border sm:p-7">
      <div>
        <h2 className="text-lg font-bold">Photos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Up to {ROOMMATE_PHOTO_LIMIT}. Only signed-in people with a live roommate profile can see them.
        </p>
      </div>
      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6" aria-label="Your photos">
          {photos.map((photo) => (
            <li key={photo.id} className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
              {photo.url ? (
                // Short-lived signed URL from a private bucket: next/image cannot cache it.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.url} alt="Your profile photo" className="size-full object-cover" />
              ) : null}
              <Button
                type="button"
                variant="inverse"
                size="icon-sm"
                className="absolute top-1.5 right-1.5 shadow-md"
                aria-label="Remove photo"
                disabled={removing === photo.id}
                onClick={() => void remove(photo)}
              >
                {removing === photo.id ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {photos.length < ROOMMATE_PHOTO_LIMIT ? (
        <ImageUploader
          upload={upload}
          onUploaded={(photo) => {
            setPhotos((current) => [...current, photo]);
            router.refresh();
          }}
          maxBytes={ROOMMATE_PHOTO_MAX_BYTES}
          maxFiles={ROOMMATE_PHOTO_LIMIT - photos.length}
          label="Add photos"
        />
      ) : null}
    </section>
  );
}
