import { BadgeCheck, CalendarCheck, FileCheck2, Heart, MessageCircle, ShieldCheck } from "lucide-react";

/**
 * Decorative hero illustration: abstract product chrome built from shapes.
 * It deliberately contains no listing, person, price or score: nothing here
 * can be mistaken for real inventory. Hidden from assistive tech.
 */
export function HeroArt() {
  return (
    <div aria-hidden className="relative mx-auto h-[26rem] w-full max-w-md select-none">
      {/* Glow */}
      <div className="absolute inset-8 rounded-full bg-violet/40 blur-[90px]" />

      {/* "Home" card: a window-like tile with placeholder bars */}
      <div className="absolute top-2 left-0 w-[68%] rotate-[-4deg] rounded-3xl bg-white p-3 shadow-xl motion-safe:animate-float">
        <div className="relative h-36 overflow-hidden rounded-2xl bg-gradient-brand-vivid">
          <div className="absolute inset-0 bg-dot-grid opacity-60" />
          <svg viewBox="0 0 200 120" className="absolute inset-x-0 bottom-0 w-full text-white/90" fill="currentColor">
            <path d="M0 120V78l34-26 30 22V52l40-32 40 32v20l26-16 30 22v62Z" opacity=".28" />
            <path d="M22 120V70l42-30 42 30v50Z" opacity=".5" />
            <rect x="52" y="82" width="24" height="38" rx="3" fill="#0B1026" opacity=".35" />
            <path d="M112 120V58l34-22 34 22v62Z" opacity=".75" />
            <rect x="134" y="70" width="12" height="14" rx="2" fill="#0B1026" opacity=".3" />
            <rect x="152" y="70" width="12" height="14" rx="2" fill="#0B1026" opacity=".3" />
          </svg>
          <span className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-white/95 text-violet shadow-md">
            <Heart className="size-4 fill-current" />
          </span>
        </div>
        <div className="space-y-2 px-1 pt-3 pb-1">
          <div className="h-3 w-3/4 rounded-full bg-ink/85" />
          <div className="h-2.5 w-1/2 rounded-full bg-ink/15" />
          <div className="flex gap-1.5 pt-1">
            <span className="h-5 w-16 rounded-full bg-lavender" />
            <span className="h-5 w-12 rounded-full bg-lavender" />
            <span className="h-5 w-14 rounded-full bg-[#e3f8ee]" />
          </div>
        </div>
      </div>

      {/* Trust signals: the three real, separate labels */}
      <div className="absolute top-16 right-0 w-[56%] rotate-[3deg] space-y-2 rounded-3xl bg-charcoal p-4 shadow-xl ring-1 ring-white/10 motion-safe:animate-float [animation-delay:-2.5s]">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <ShieldCheck className="size-4 text-green" />
          Trust signals
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-white">
          <BadgeCheck className="size-4 shrink-0 text-green" /> Owner verified
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-white">
          <FileCheck2 className="size-4 shrink-0 text-[#8fb0ff]" /> Authorisation verified
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-white">
          <CalendarCheck className="size-4 shrink-0 text-violet-soft" /> Recently confirmed
        </div>
      </div>

      {/* "People" card: two overlapping avatars and chat bubbles made of bars */}
      <div className="absolute bottom-0 left-[12%] w-[70%] rotate-[2deg] rounded-3xl bg-white p-4 shadow-xl motion-safe:animate-float [animation-delay:-4.5s]">
        <div className="flex items-center gap-3">
          <div className="flex">
            <span className="size-10 rounded-full bg-gradient-brand-vivid ring-2 ring-white" />
            <span className="-ml-3 size-10 rounded-full bg-green ring-2 ring-white" />
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-2/3 rounded-full bg-ink/85" />
            <div className="h-2 w-2/5 rounded-full bg-ink/15" />
          </div>
          <span className="flex size-9 items-center justify-center rounded-full bg-lavender text-violet">
            <MessageCircle className="size-4" />
          </span>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-7 w-3/5 rounded-2xl rounded-bl-md bg-[#f1f0f7]" />
          <div className="ml-auto h-7 w-1/2 rounded-2xl rounded-br-md bg-gradient-brand" />
        </div>
      </div>
    </div>
  );
}
