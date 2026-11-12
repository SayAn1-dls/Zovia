"use client";

import { BadgeCheck, Loader2, MessageCircle, Phone, UserRound } from "lucide-react";
import Link from "next/link";

import { FormMessage } from "@/components/form/form-field";
import { useSession } from "@/components/session/session-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { isApiError } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { dynamicRoutes, signInHref } from "@/lib/navigation";

import { useRevealContact } from "../queries";
import { OWNER_TYPE_LABELS, type OwnerCard } from "../schemas";

function waLink(number: string): string {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

/**
 * The owner's public card. Contact details are never part of the page: "Show phone number"
 * asks `reveal_owner_contact()` (signed-in, rate limited, recorded). Signed out -> sign in.
 */
export function OwnerContactCard({ owner, propertyId, slug }: { owner: OwnerCard | null; propertyId: string; slug: string }) {
  const session = useSession();
  const reveal = useRevealContact(propertyId);
  const contact = reveal.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
          <UserRound className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{owner?.display_name ?? "Owner"}</p>
          <p className="text-sm text-muted-foreground">
            {owner ? OWNER_TYPE_LABELS[owner.owner_type] : "Owner"}
            {owner?.member_since ? ` · on ZUVIO since ${formatDate(owner.member_since, { month: "short", year: "numeric" })}` : ""}
          </p>
        </div>
      </div>
      {owner?.verification_status === "verified" ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-success-foreground">
          <BadgeCheck className="size-4" aria-hidden />
          Identity verified by ZUVIO
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Identity not verified yet.</p>
      )}

      {contact ? (
        <div className="space-y-2 rounded-2xl bg-muted p-4">
          {contact.contact_phone ? (
            <a
              href={`tel:${contact.contact_phone}`}
              className="flex min-h-11 items-center gap-2 text-lg font-semibold tabular-nums"
            >
              <Phone className="size-5" aria-hidden />
              {contact.contact_phone}
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">The owner hasn&apos;t added a phone number.</p>
          )}
          {contact.whatsapp_number ? (
            <a
              href={waLink(contact.whatsapp_number)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4"
            >
              <MessageCircle className="size-4" aria-hidden />
              WhatsApp {contact.whatsapp_number}
            </a>
          ) : null}
          <p className="text-xs text-muted-foreground">Never pay a deposit before you have seen the place.</p>
        </div>
      ) : session.isSignedIn ? (
        <Button variant="outline" size="lg" className="w-full" disabled={reveal.isPending} onClick={() => reveal.mutate()}>
          {reveal.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Phone aria-hidden />}
          Show phone number
        </Button>
      ) : (
        <Link
          href={signInHref(dynamicRoutes.property(slug))}
          className={buttonVariants({ variant: "outline", size: "lg", className: "w-full" })}
        >
          <Phone aria-hidden />
          Sign in to see the phone number
        </Link>
      )}
      {reveal.isError ? (
        <FormMessage tone="danger">
          {isApiError(reveal.error) ? reveal.error.message : "That did not work. Please try again."}
        </FormMessage>
      ) : null}
    </div>
  );
}
