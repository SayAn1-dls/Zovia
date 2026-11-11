/**
 * Client-side image preparation: validate, downscale to at most 1920 px on the
 * long edge and re-encode as WebP before upload (spec section 6.8).
 *
 * The geometry, naming and validation helpers are pure and unit-tested; the
 * canvas work in `resizeImageToWebp` only runs in a browser.
 */

export const MAX_IMAGE_DIMENSION = 1920;
export const WEBP_QUALITY = 0.82;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ImageSize = { width: number; height: number };

/** Scales a size down (never up) so both edges fit within `max`, keeping the aspect ratio. */
export function fitWithin(size: ImageSize, max = MAX_IMAGE_DIMENSION): ImageSize {
  const { width, height } = size;
  if (!(width > 0) || !(height > 0) || !(max > 0)) {
    throw new RangeError("Image dimensions must be positive");
  }
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** "IMG 0012.JPEG" -> "img-0012.webp". Always returns a safe, non-empty name. */
export function webpFileName(originalName: string): string {
  const base = originalName
    .replace(/\.[^./\\]+$/, "")
    .split(/[\\/]/)
    .pop()!
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return `${base || "image"}.webp`;
}

export type ImageValidationError =
  | { code: "unsupported_type"; message: string }
  | { code: "too_large"; message: string }
  | { code: "empty"; message: string };

/** 8388608 -> "8 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1).replace(/\.0$/, "")} MB`;
}

/**
 * Checks a file before any work is done. `maxBytes` applies to the ORIGINAL
 * file as a sanity bound; the bucket limit is checked again after compression.
 */
export function validateImageFile(
  file: { type: string; size: number; name: string },
  options: { accept?: readonly string[]; maxBytes: number },
): ImageValidationError | null {
  const accept = options.accept ?? ACCEPTED_IMAGE_TYPES;
  if (!accept.includes(file.type)) {
    return {
      code: "unsupported_type",
      message: `${file.name} is not a supported image. Use JPEG, PNG or WebP.`,
    };
  }
  if (file.size === 0) {
    return { code: "empty", message: `${file.name} is empty.` };
  }
  if (file.size > options.maxBytes) {
    return {
      code: "too_large",
      message: `${file.name} is larger than ${formatBytes(options.maxBytes)}.`,
    };
  }
  return null;
}

export type PreparedImage = {
  file: File;
  width: number;
  height: number;
  /** True when the image was re-encoded; false when the original was kept. */
  converted: boolean;
};

/**
 * Downscales and re-encodes an image as WebP in the browser. Falls back to the
 * original file when the browser cannot encode WebP or the result is larger
 * than a WebP original that already fits.
 */
export async function resizeImageToWebp(
  file: File,
  options: { maxDimension?: number; quality?: number } = {},
): Promise<PreparedImage> {
  const maxDimension = options.maxDimension ?? MAX_IMAGE_DIMENSION;
  const quality = options.quality ?? WEBP_QUALITY;

  // imageOrientation: "from-image" applies EXIF rotation so phone photos are upright.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const source = { width: bitmap.width, height: bitmap.height };
    const target = fitWithin(source, maxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    const unchangedSize = target.width === source.width && target.height === source.height;
    // Safari before 14 returns PNG when asked for WebP: keep the original then.
    if (!blob || blob.type !== "image/webp") {
      return { file, ...source, converted: false };
    }
    if (unchangedSize && file.type === "image/webp" && blob.size >= file.size) {
      return { file, ...source, converted: false };
    }
    return {
      file: new File([blob], webpFileName(file.name), { type: "image/webp" }),
      ...target,
      converted: true,
    };
  } finally {
    bitmap.close();
  }
}
