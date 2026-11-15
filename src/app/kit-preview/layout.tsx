import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The UI kit preview is a developer tool: it does not exist in production builds unless
 * ENABLE_KIT_PREVIEW=true is set on purpose.
 */
export default function KitPreviewLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_KIT_PREVIEW !== "true") notFound();
  return children;
}
