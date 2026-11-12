"use client";

import { Eye, EyeOff, Heart, X } from "lucide-react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "motion/react";
import { useState } from "react";
import { useWatch, type Control, type DeepPartialSkipArrayKey } from "react-hook-form";

import { cn } from "@/lib/utils";

import type { PublicRoommateCard, RoommateProfileFormValues, RoommateProfileInput } from "../schemas";
import { RoommateCard, SWIPE_DISTANCE, SwipeStamps } from "./roommate-card";

type Values = RoommateProfileFormValues;

function toInt(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Builds the card other people would see from the (unsaved) form values. Pure, no I/O. */
export function previewCard(values: DeepPartialSkipArrayKey<Values>, displayName: string, photoUrls: string[]): PublicRoommateCard {
  const place = values.has_place && values.place ? values.place : null;
  const placeTitle = text(place?.title);
  return {
    user_id: "preview",
    display_name: displayName,
    avatar_url: null,
    headline: text(values.headline),
    about: text(values.about),
    age: toInt(values.age),
    gender: values.gender ? values.gender : null,
    occupation: values.occupation ? values.occupation : null,
    occupation_detail: text(values.occupation_detail),
    city: text(values.city),
    preferred_localities: (values.preferred_localities ?? []).filter((v): v is string => typeof v === "string"),
    budget_min: toInt(values.budget_min),
    budget_max: toInt(values.budget_max),
    move_in_date: text(values.move_in_date),
    has_place: Boolean(place && placeTitle),
    place: place && placeTitle
      ? {
          title: placeTitle,
          description: text(place.description),
          property_type: null,
          locality: text(place.locality),
          city: text(values.city),
          rent_share: toInt(place.rent_share),
          deposit_share: toInt(place.deposit_share),
          vacancies: toInt(place.vacancies),
          available_from: text(place.available_from),
          furnishing: place.furnishing ? place.furnishing : null,
        }
      : null,
    photo_urls: photoUrls,
  };
}

/**
 * Live "Preview your card" panel for the profile form, with a practice swipe. Nothing is sent
 * anywhere: the card is rebuilt from the form values on every change and swipes only animate.
 */
export function ProfileCardPreview({
  control,
  displayName,
  photoUrls,
}: {
  control: Control<Values, unknown, RoommateProfileInput>;
  displayName: string;
  photoUrls: string[];
}) {
  const values = useWatch({ control });
  const reduceMotion = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState("Drag the card, or try the buttons. Nothing is sent.");
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], reduceMotion ? [0, 0] : [-14, 14]);
  const opacity = useMotionValue(1);
  const person = previewCard(values, displayName, photoUrls);

  async function practice(direction: 1 | -1) {
    if (busy) return;
    setCaption(direction === 1 ? "Swiped right: that's a like." : "Swiped left: that's a pass.");
    if (reduceMotion) return;
    setBusy(true);
    setExpanded(false);
    await animate(x, direction * 480, { duration: 0.3, ease: [0.4, 0, 1, 1] });
    x.set(0);
    opacity.set(0);
    await animate(opacity, 1, { duration: 0.25 });
    setBusy(false);
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_DISTANCE) void practice(1);
    else if (info.offset.x < -SWIPE_DISTANCE) void practice(-1);
  }

  return (
    <section aria-labelledby="card-preview-heading" className="overflow-hidden rounded-3xl bg-card p-4 ring-1 ring-border sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="card-preview-heading" className="text-lg font-bold">
            Preview your card
          </h2>
          <p className="text-sm text-muted-foreground">This is how you appear in other people&apos;s deck.</p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-semibold lg:hidden"
          aria-expanded={open}
          aria-controls="card-preview-body"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          {open ? "Hide" : "Show"}
        </button>
      </div>

      <div id="card-preview-body" className={cn("mt-4", open ? "block" : "hidden", "lg:block")}>
        <div className="relative mx-auto h-[460px] max-w-[340px]">
          <motion.div
            className="absolute inset-0 cursor-grab touch-pan-y active:cursor-grabbing"
            style={{ x, rotate, opacity }}
            drag={reduceMotion || busy ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.9}
            onDragEnd={onDragEnd}
          >
            <RoommateCard
              person={person}
              compatibility={null}
              expanded={expanded}
              onToggleExpanded={() => setExpanded((value) => !value)}
              reduceMotion={reduceMotion}
            />
            {!reduceMotion ? <SwipeStamps x={x} /> : null}
          </motion.div>
        </div>
        <div className="mt-5 flex items-center justify-center gap-6">
          <button
            type="button"
            className="flex size-12 items-center justify-center rounded-full bg-card text-coral shadow-md ring-1 ring-border"
            aria-label="Practice a pass"
            onClick={() => void practice(-1)}
          >
            <X className="size-6" strokeWidth={3} aria-hidden />
          </button>
          <button
            type="button"
            className="flex size-14 items-center justify-center rounded-full bg-lime text-ink shadow-md ring-1 ring-ink/10"
            aria-label="Practice a like"
            onClick={() => void practice(1)}
          >
            <Heart className="size-7 fill-current" aria-hidden />
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground" aria-live="polite">
          {caption}
        </p>
        {photoUrls.length === 0 ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">Add a photo to replace your initials.</p>
        ) : null}
      </div>
    </section>
  );
}
