import { cn } from "cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-shimmer rounded-lg bg-[linear-gradient(100deg,var(--muted)_40%,color-mix(in_oklch,var(--muted),white_60%)_50%,var(--muted)_60%)] bg-[length:200%_100%]", className)}
      {...props}
    />
  );
}

export { Skeleton };
