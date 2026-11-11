"use client";

import { Check, ImagePlus, Loader2, RotateCw, X } from "lucide-react";
import { type DragEvent, useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  ACCEPTED_IMAGE_TYPES,
  formatBytes,
  MAX_IMAGE_DIMENSION,
  type PreparedImage,
  resizeImageToWebp,
  validateImageFile,
} from "./resize";

/** What the injected upload function receives. */
export type UploadContext = {
  /** Report progress as a fraction 0..1. Optional: without calls the bar is indeterminate. */
  onProgress: (fraction: number) => void;
  /** Aborted when the user removes the file mid-upload. */
  signal: AbortSignal;
  /** Pixel size of the prepared image (store as width/height). */
  width: number;
  height: number;
};

/**
 * The feature supplies this. It owns the bucket and path logic (for example a
 * Supabase Storage upload to `property-media/<property_id>/<uuid>.webp`) and
 * resolves with whatever the feature needs back (storage path, row, ...).
 */
export type UploadFn<TResult> = (file: File, context: UploadContext) => Promise<TResult>;

type ImageUploaderProps<TResult> = {
  upload: UploadFn<TResult>;
  /** Called once per file after its upload resolves. */
  onUploaded?: (result: TResult, file: File) => void;
  /** Bucket size limit in bytes, checked after compression (e.g. 8 MB for property-media). */
  maxBytes: number;
  /** How many more files may be added (remaining slots). Default 10. */
  maxFiles?: number;
  multiple?: boolean;
  disabled?: boolean;
  /** Long-edge limit in px before upload. Default 1920. */
  maxDimension?: number;
  label?: string;
  hint?: string;
  className?: string;
};

type Item = {
  id: string;
  name: string;
  previewUrl: string | null;
  status: "preparing" | "uploading" | "done" | "error";
  /** 0..1, or null while indeterminate. */
  progress: number | null;
  error: string | null;
  source: File;
};

let itemCounter = 0;

/**
 * Drag-and-drop + picker image uploader.
 *
 * Each file is validated, downscaled to at most `maxDimension` px and
 * re-encoded as WebP in the browser, then handed to the injected `upload`
 * function. Per-file progress, retry and remove. Keyboard accessible: the
 * drop zone is a real button.
 */
export function ImageUploader<TResult>({
  upload,
  onUploaded,
  maxBytes,
  maxFiles = 10,
  multiple = true,
  disabled = false,
  maxDimension = MAX_IMAGE_DIMENSION,
  label = "Add photos",
  hint,
  className,
}: ImageUploaderProps<TResult>) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const previews = useRef(new Set<string>());
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const patch = useCallback((id: string, changes: Partial<Item>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  // Abort uploads and release preview URLs when the component unmounts.
  useEffect(() => {
    const activeControllers = controllers.current;
    const activePreviews = previews.current;
    return () => {
      activeControllers.forEach((controller) => controller.abort());
      activePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const run = useCallback(
    async (id: string, source: File) => {
      const controller = new AbortController();
      controllers.current.set(id, controller);
      patch(id, { status: "preparing", progress: null, error: null });
      try {
        let prepared: PreparedImage;
        try {
          prepared = await resizeImageToWebp(source, { maxDimension });
        } catch {
          throw new Error("This image could not be read. Try a different file.");
        }
        if (prepared.file.size > maxBytes) {
          throw new Error(`Still larger than ${formatBytes(maxBytes)} after compression.`);
        }
        if (controller.signal.aborted) return;
        patch(id, { status: "uploading", progress: 0 });
        const result = await upload(prepared.file, {
          signal: controller.signal,
          width: prepared.width,
          height: prepared.height,
          onProgress: (fraction) =>
            patch(id, { progress: Math.min(1, Math.max(0, fraction)) }),
        });
        if (controller.signal.aborted) return;
        patch(id, { status: "done", progress: 1 });
        onUploaded?.(result, prepared.file);
      } catch (error) {
        if (controller.signal.aborted) return;
        patch(id, {
          status: "error",
          progress: null,
          error:
            error instanceof Error && error.message
              ? error.message
              : "Upload failed. Try again.",
        });
      } finally {
        controllers.current.delete(id);
      }
    },
    [maxBytes, maxDimension, onUploaded, patch, upload],
  );

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      if (disabled) return;
      const files = Array.from(list);
      const problems: string[] = [];
      const accepted: File[] = [];
      for (const file of files) {
        // Originals may be large phone photos; allow 4x the bucket limit before compression.
        const problem = validateImageFile(file, { maxBytes: maxBytes * 4 });
        if (problem) problems.push(problem.message);
        else accepted.push(file);
      }
      const active = items.filter((item) => item.status !== "error").length;
      const room = Math.max(0, (multiple ? maxFiles : 1) - active);
      if (accepted.length > room) {
        problems.push(
          room === 0
            ? "You have reached the photo limit."
            : `Only ${room} more ${room === 1 ? "photo" : "photos"} can be added.`,
        );
      }
      const batch = accepted.slice(0, room).map((file) => {
        const previewUrl = URL.createObjectURL(file);
        previews.current.add(previewUrl);
        itemCounter += 1;
        return {
          id: `upload-${itemCounter}`,
          name: file.name,
          previewUrl,
          status: "preparing" as const,
          progress: null,
          error: null,
          source: file,
        };
      });
      setNotice(problems.length ? problems.join(" ") : null);
      if (batch.length === 0) return;
      setItems((current) => [...current, ...batch]);
      for (const item of batch) void run(item.id, item.source);
    },
    [disabled, items, maxBytes, maxFiles, multiple, run],
  );

  function remove(item: Item) {
    controllers.current.get(item.id)?.abort();
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
      previews.current.delete(item.previewUrl);
    }
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          if (event.target.files?.length) addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-input/70 bg-card px-6 py-8 text-center transition-colors duration-150 hover:border-violet hover:bg-secondary/50 focus-visible:border-violet focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
          dragging && "border-violet bg-secondary",
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-violet-strong">
          <ImagePlus className="size-6" aria-hidden />
        </span>
        <span className="text-base font-semibold">{label}</span>
        <span className="text-sm text-muted-foreground">
          {hint ??
            `Drag photos here or tap to choose. JPEG, PNG or WebP, up to ${formatBytes(maxBytes)} each.`}
        </span>
      </button>

      {notice ? (
        <p role="alert" className="text-sm font-medium text-danger-foreground">
          {notice}
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Uploads">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl bg-card p-2 pr-1 shadow-xs ring-1 ring-border"
            >
              <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                {item.previewUrl ? (
                  // Local blob preview: next/image cannot optimise object URLs.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.previewUrl} alt="" className="size-full object-cover" />
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                {item.status === "error" ? (
                  <p role="alert" className="text-xs font-medium text-danger-foreground">
                    {item.error}
                  </p>
                ) : item.status === "done" ? (
                  <p className="flex items-center gap-1 text-xs font-medium text-success-foreground">
                    <Check className="size-3.5" aria-hidden /> Uploaded
                  </p>
                ) : (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div
                      role="progressbar"
                      aria-label={`Uploading ${item.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={
                        item.progress === null ? undefined : Math.round(item.progress * 100)
                      }
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                    >
                      <div
                        className={cn(
                          "h-full rounded-full bg-gradient-brand transition-[width] duration-200",
                          item.progress === null && "w-1/3 animate-pulse",
                        )}
                        style={
                          item.progress === null
                            ? undefined
                            : { width: `${Math.max(4, item.progress * 100)}%` }
                        }
                      />
                    </div>
                    <span className="flex w-16 items-center justify-end gap-1 text-xs text-muted-foreground tabular-nums">
                      {item.status === "preparing" ? (
                        <>
                          <Loader2 className="size-3 animate-spin" aria-hidden /> Resizing
                        </>
                      ) : item.progress === null ? (
                        "Uploading"
                      ) : (
                        `${Math.round(item.progress * 100)}%`
                      )}
                    </span>
                  </div>
                )}
              </div>
              {item.status === "error" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Retry ${item.name}`}
                  onClick={() => void run(item.id, item.source)}
                >
                  <RotateCw aria-hidden />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={`Remove ${item.name}`}
                onClick={() => remove(item)}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
