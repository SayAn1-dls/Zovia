"use client";

import { Loader2 } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for irreversible actions (delete, unmatch, block). */
  destructive?: boolean;
  /**
   * Called on confirm. May be async: the dialog shows a spinner, stays open
   * while pending, closes on success and stays open (showing `errorMessage`)
   * if it throws.
   */
  onConfirm: () => void | Promise<void>;
  errorMessage?: string;
  /** Element that opens the dialog (Base UI `render` prop), e.g. <Button variant="outline">Delete</Button>. */
  trigger?: ReactElement;
  /** Controlled mode (omit `trigger` and drive it yourself). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** "Are you sure?" dialog with async-aware confirm. Focus is trapped and Escape cancels. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  errorMessage = "That did not work. Please try again.",
  trigger,
  open: controlledOpen,
  onOpenChange,
}: ConfirmDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const open = controlledOpen ?? internalOpen;

  function setOpen(next: boolean) {
    if (pending) return;
    if (next) setFailed(false);
    setInternalOpen(next);
    onOpenChange?.(next);
  }

  async function handleConfirm() {
    setPending(true);
    setFailed(false);
    try {
      await onConfirm();
      setPending(false);
      setInternalOpen(false);
      onOpenChange?.(false);
    } catch {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger ? <AlertDialogTrigger render={trigger} /> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {failed ? (
          <p role="alert" className="text-sm font-medium text-danger-foreground">
            {errorMessage}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel size="lg" disabled={pending}>
            {cancelLabel}
          </AlertDialogCancel>
          <Button
            size="lg"
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
            ) : null}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
