"use client";

import { CircleCheck, Loader2, Send } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/features/properties/components/native-select";
import { sendMessage } from "@/lib/send-message";

import { SHARING_LABELS, type SharingType } from "../listings";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9\s-]{8,16}$/;

/**
 * "Book a visit / ask a question" for a PG. Goes to the Zovia inbox (sendMessage) with the
 * visitor as Reply-To; Zovia confirms price, vacancy and a visit slot with the owner and replies.
 */
export function VisitRequestForm({
  listingTitle,
  place,
  sharing,
}: {
  listingTitle: string;
  place: string;
  sharing: SharingType[];
}) {
  const id = useId();
  const [values, setValues] = useState({ name: "", email: "", phone: "", sharing: sharing[0] ?? "", moveIn: "", message: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof values, string>>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (values.name.trim().length < 2) next.name = "Enter your name.";
    if (!EMAIL.test(values.email.trim())) next.email = "Enter a valid e-mail, like name@example.com.";
    if (!PHONE.test(values.phone.trim())) next.phone = "Enter a 10-digit mobile number.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setState("sending");
    const result = await sendMessage({
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      subject: `Visit request: ${listingTitle}, ${place}`.slice(0, 150),
      message: [
        `PG: ${listingTitle} (${place})`,
        `Room: ${values.sharing ? SHARING_LABELS[values.sharing as SharingType] : "any"}`,
        `Move-in: ${values.moveIn || "flexible"}`,
        `Phone: ${values.phone.trim()}`,
        "",
        values.message.trim() || "I'd like to visit and know about availability.",
      ].join("\n"),
    });
    setState(result.ok ? "sent" : "failed");
  }

  if (state === "sent") {
    return (
      <div role="status" className="rounded-2xl bg-success-surface p-5 text-success-foreground">
        <CircleCheck className="size-6" aria-hidden />
        <p className="mt-2 font-semibold">Request sent</p>
        <p className="mt-1 text-sm">
          We&apos;ll confirm availability and a visit time with the owner, then reply to {values.email} or call you.
        </p>
      </div>
    );
  }

  const field = "space-y-1.5";
  const label = "text-sm font-medium";
  const error = (key: keyof typeof values) =>
    errors[key] ? (
      <p id={`${id}-${key}-error`} className="text-xs text-danger-foreground">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <div className={field}>
        <label htmlFor={`${id}-name`} className={label}>
          Your name
        </label>
        <Input id={`${id}-name`} autoComplete="name" value={values.name} onChange={set("name")} aria-invalid={Boolean(errors.name)} />
        {error("name")}
      </div>
      <div className={field}>
        <label htmlFor={`${id}-phone`} className={label}>
          Mobile number
        </label>
        <Input
          id={`${id}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          value={values.phone}
          onChange={set("phone")}
          aria-invalid={Boolean(errors.phone)}
        />
        {error("phone")}
      </div>
      <div className={field}>
        <label htmlFor={`${id}-email`} className={label}>
          E-mail
        </label>
        <Input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={values.email}
          onChange={set("email")}
          aria-invalid={Boolean(errors.email)}
        />
        {error("email")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={field}>
          <label htmlFor={`${id}-sharing`} className={label}>
            Room
          </label>
          <NativeSelect id={`${id}-sharing`} value={values.sharing} onChange={set("sharing")}>
            {sharing.map((type) => (
              <option key={type} value={type}>
                {SHARING_LABELS[type]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className={field}>
          <label htmlFor={`${id}-move`} className={label}>
            Move-in
          </label>
          <Input id={`${id}-move`} type="date" value={values.moveIn} onChange={set("moveIn")} />
        </div>
      </div>
      <div className={field}>
        <label htmlFor={`${id}-message`} className={label}>
          Anything to ask? <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea id={`${id}-message`} rows={3} maxLength={1500} value={values.message} onChange={set("message")} />
      </div>
      {state === "failed" ? (
        <p role="alert" className="rounded-xl bg-danger-surface p-3 text-sm text-danger-foreground">
          That didn&apos;t go through. Check your connection and try again.
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={state === "sending"}>
        {state === "sending" ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {state === "sending" ? "Sending…" : "Request a visit"}
      </Button>
      <p className="text-xs text-muted-foreground">Free, no brokerage. Your request goes straight to the Zovia team.</p>
    </form>
  );
}
