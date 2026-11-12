import { photoSchema } from "@/features/roommates/schemas";
import { addPhoto } from "@/features/roommates/service";
import { createHandler, created } from "@/server/http";

/**
 * POST /api/v1/roommates/photos: registers a photo the caller already uploaded to the private
 * "roommate-photos" bucket under their own folder. Returns the row and a signed URL.
 */
export const POST = createHandler(
  { auth: "user", label: "roommates.photos.add", rateLimit: "upload", body: photoSchema },
  async ({ supabase, user, requestId, body }) => created(await addPhoto({ supabase, user, requestId }, body.storage_path)),
);
