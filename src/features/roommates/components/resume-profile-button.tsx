"use client";

import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch, isApiError } from "@/lib/api/client";

/** Turns a paused or draft profile live. The database refuses it if the basics are missing. */
export function ResumeProfileButton({ label = "Go live" }: { label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function resume() {
    setPending(true);
    try {
      await apiFetch("/roommates/profile/status", { method: "PATCH", body: { status: "active" } });
      toast.success("You're live again.");
      router.refresh();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "That did not work. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Button size="lg" onClick={() => void resume()} disabled={pending}>
      {pending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Play data-icon="inline-start" aria-hidden />}
      {label}
    </Button>
  );
}
