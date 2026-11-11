"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Seconds to wait before animating (use for small staggers). */
  delay?: number;
  /** Rise distance in px. */
  y?: number;
  as?: "div" | "li" | "section";
};

/**
 * Section reveal: fades and rises once when scrolled into view.
 * With prefers-reduced-motion the content is simply shown (zero duration, no
 * movement). Content is server-rendered, so it is in the HTML for crawlers.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  as = "div",
}: RevealProps) {
  const reduce = useReducedMotion();
  const Component = motion[as];
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={
        reduce
          ? { duration: 0 }
          : { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }
      }
    >
      {children}
    </Component>
  );
}
