"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { applyApiFieldErrors, FormField, FormMessage } from "@/components/form/form-field";
import { useSession } from "@/components/session/session-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isApiError } from "@/lib/api/client";
import { dynamicRoutes, signInHref } from "@/lib/navigation";

import { useSendInquiry } from "../queries";
import { inquirySchema, type InquiryFormValues, type InquiryInput, type PropertyRoom } from "../schemas";
import { NativeSelect } from "./native-select";

const FIELDS = ["message", "move_in_date", "occupants", "room_id"] as const;

/** "Send enquiry": a message to the owner through `create_property_inquiry()`. Never a booking. */
export function InquiryForm({
  propertyId,
  slug,
  rooms,
}: {
  propertyId: string;
  slug: string;
  rooms: Pick<PropertyRoom, "id" | "name">[];
}) {
  const session = useSession();
  const send = useSendInquiry(propertyId);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<InquiryFormValues, unknown, InquiryInput>({
    resolver: zodResolver(inquirySchema),
    defaultValues: { message: "", move_in_date: "", occupants: 1, room_id: "" },
    mode: "onTouched",
  });

  if (!session.isSignedIn) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Sign in to send the owner a message about this place.</p>
        <Link
          href={signInHref(dynamicRoutes.property(slug))}
          className={buttonVariants({ size: "lg", className: "w-full" })}
          aria-disabled={session.isLoading}
        >
          <Send aria-hidden />
          Sign in to send an enquiry
        </Link>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="space-y-3" role="status">
        <p className="flex items-center gap-2 font-semibold text-success-foreground">
          <CheckCircle2 className="size-5" aria-hidden />
          Enquiry sent
        </p>
        <p className="text-sm text-muted-foreground">
          The owner has been notified and will reply to you. An enquiry is not a booking.
        </p>
      </div>
    );
  }

  async function onSubmit(values: InquiryInput) {
    setFailure(null);
    try {
      await send.mutateAsync(values);
      setSent(true);
      form.reset();
    } catch (error) {
      if (isApiError(error)) {
        if (error.code === "validation_failed") applyApiFieldErrors(form.setError, error.details, FIELDS);
        setFailure(error.message);
      } else {
        setFailure("That did not work. Please try again.");
      }
    }
  }

  const busy = form.formState.isSubmitting;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      {failure ? <FormMessage tone="danger">{failure}</FormMessage> : null}
      <FormField control={form.control} name="message" label="Message">
        {(field) => (
          <Textarea
            rows={4}
            maxLength={1000}
            placeholder="Hi, I'm looking for a place from next month. Is a bed still available?"
            {...field}
            value={field.value ?? ""}
          />
        )}
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField control={form.control} name="move_in_date" label="Move-in" optional>
          {(field) => <Input type="date" {...field} value={field.value ?? ""} />}
        </FormField>
        <FormField control={form.control} name="occupants" label="People">
          {(field) => (
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={12}
              {...field}
              value={field.value === undefined || field.value === null ? "" : String(field.value)}
            />
          )}
        </FormField>
      </div>
      {rooms.length > 1 ? (
        <FormField control={form.control} name="room_id" label="Room" optional>
          {(field) => (
            <NativeSelect {...field} value={field.value ?? ""}>
              <option value="">Any room</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {busy ? "Sending…" : "Send enquiry"}
      </Button>
      <p className="text-xs text-muted-foreground">Keep payments and phone numbers off chat until you have visited.</p>
    </form>
  );
}
