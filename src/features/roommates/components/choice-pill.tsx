"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ChoicePillProps = {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  disabled?: boolean;
};

/**
 * A native radio / checkbox drawn as a pill. The input stays in the accessibility tree (visually
 * hidden), so arrow keys, Space and screen readers behave as usual; the pill is the label.
 */
export function ChoicePill({ type, name, value, checked, onChange, children, disabled }: ChoicePillProps) {
  return (
    <label
      className={cn(
        "relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-150 select-none has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/25",
        checked
          ? "border-ink bg-ink text-white"
          : "border-foreground/20 bg-card text-foreground hover:border-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      {checked ? <Check className="size-3.5" aria-hidden /> : null}
      {children}
    </label>
  );
}
