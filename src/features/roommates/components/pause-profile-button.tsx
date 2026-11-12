"use client";

import { Pause } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";

export function PauseProfileButton() {
  const router = useRouter();
  return (
    <ConfirmDialog
      title="Pause your profile?"
      description="You will be hidden from other people's decks. Your matches and chats stay."
      confirmLabel="Pause"
      onConfirm={async () => {
        await apiFetch("/roommates/profile/status", { method: "PATCH", body: { status: "paused" } });
        toast.success("Profile paused.");
        router.refresh();
      }}
      trigger={
        <Button variant="ghost" size="lg">
          <Pause data-icon="inline-start" aria-hidden /> Pause
        </Button>
      }
    />
  );
}
