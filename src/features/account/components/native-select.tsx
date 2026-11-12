import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** A native <select> styled like Input: accessible and reliable on every phone keyboard. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full min-w-0 cursor-pointer appearance-none rounded-xl border border-input bg-card bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")] bg-[right_0.875rem_center] bg-no-repeat px-3.5 py-2 pr-10 text-base transition-[border-color,box-shadow] duration-150 outline-none hover:border-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-[0.9375rem]",
        className,
      )}
      {...props}
    />
  );
}
