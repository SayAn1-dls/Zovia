import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { DetailSkeleton } from "@/components/feedback/loading-state";
import { FormMessage } from "@/components/form/form-field";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  SAMPLE_NOTICE,
  invoiceLines,
  invoiceRows,
  invoiceStatus,
  invoiceTitle,
  isTaxInvoice,
  type InvoiceIssuer,
  type StayInvoice,
} from "@/features/stays/invoice";
import { invoiceIssuer } from "@/features/stays/notifications";
import { createStayRepository, getStayInvoice } from "@/features/stays/repository";
import { routes, signInHref } from "@/lib/navigation";
import { getServiceContext } from "@/server/auth";

import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Booking receipt", robots: { index: false } };

/** Only the receipt is printed: the app's header, tab bar and buttons are hidden on paper. */
const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #stay-receipt, #stay-receipt * { visibility: visible !important; }
  #stay-receipt { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none; border: 0; }
}`;

type Params = Promise<{ id: string }>;

export default function InvoicePage({ params }: { params: Params }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense fallback={<DetailSkeleton />}>
        <InvoiceBody params={params} />
      </Suspense>
    </div>
  );
}

async function InvoiceBody({ params }: { params: Params }) {
  const { id } = await params;
  const { supabase, user } = await getServiceContext();
  if (!user) redirect(signInHref(`/bookings/${id}/invoice`));
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [invoice, own] = await Promise.all([getStayInvoice(supabase, id), createStayRepository(supabase).getBooking(id)]);
  const back = { href: `/bookings/${id}` as Route, label: "Booking" };

  if (!own) {
    // Not the caller's booking (or no such booking): the same answer as the booking page.
    return (
      <>
        <PageHeader title="Receipt" back={{ href: routes.bookings, label: "My bookings" }} />
        <EmptyState
          className="mt-6"
          title="Booking not found"
          description="It may belong to another account, or the link is wrong."
          action={
            <Link href={routes.bookings} className={buttonVariants({ variant: "outline", size: "lg" })}>
              My bookings
            </Link>
          }
        />
      </>
    );
  }
  if (!invoice) {
    return (
      <>
        <PageHeader title="Receipt" back={back} />
        <FormMessage tone="info" title="No receipt yet" className="mt-6">
          A receipt is issued once the booking is confirmed. If you have just paid, it appears here in a minute.
        </FormMessage>
      </>
    );
  }

  return (
    <>
      <style>{PRINT_CSS}</style>
      <PageHeader title="Receipt" back={back} actions={<PrintButton />} />
      <Receipt invoice={invoice} issuer={invoiceIssuer()} />
    </>
  );
}

function Receipt({ invoice, issuer }: { invoice: StayInvoice; issuer: InvoiceIssuer }) {
  const { booking } = invoice;
  const status = invoiceStatus(booking);
  const rows = invoiceRows(invoice);
  const lines = invoiceLines(booking);
  const issued = new Date(invoice.issued_at).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  return (
    <article id="stay-receipt" className="mt-6 space-y-6 rounded-3xl bg-card p-5 ring-1 ring-border sm:p-8" aria-labelledby="receipt-title">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Zovia</p>
          <h2 id="receipt-title" className="text-xl font-bold">
            {invoiceTitle(issuer)}
          </h2>
          {isTaxInvoice(issuer) ? (
            <p className="mt-1 text-sm">
              {issuer.legal_name} · GSTIN {issuer.gstin}
              {issuer.address ? <span className="block text-muted-foreground">{issuer.address}</span> : null}
            </p>
          ) : null}
        </div>
        <dl className="text-right text-sm">
          <dt className="text-muted-foreground">Number</dt>
          <dd className="font-semibold tabular-nums">{invoice.invoice_no}</dd>
          <dt className="mt-1 text-muted-foreground">Issued</dt>
          <dd className="font-semibold">{issued}</dd>
        </dl>
      </header>

      <FormMessage tone={status.tone} title={status.label}>
        {status.detail}
      </FormMessage>

      <DefinitionTable rows={rows.stay} />

      <section aria-labelledby="receipt-price">
        <h3 id="receipt-price" className="mb-2 text-base font-semibold">
          Price
        </h3>
        <table className="w-full text-sm">
          <tbody>
            {lines.map(([label, value], index) => {
              const last = index === lines.length - 1;
              return (
                <tr key={label} className="border-b border-border last:border-0">
                  <th scope="row" className={`py-2 pr-4 text-left font-normal ${last ? "font-bold" : "text-muted-foreground"}`}>
                    {label}
                  </th>
                  <td className={`py-2 text-right tabular-nums ${last ? "text-base font-bold" : ""}`}>{value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="receipt-guest">
        <h3 id="receipt-guest" className="mb-2 text-base font-semibold">
          Guest
        </h3>
        <DefinitionTable rows={rows.guest} />
      </section>

      <p className="text-xs text-muted-foreground">{SAMPLE_NOTICE}</p>
    </article>
  );
}

function DefinitionTable({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="pt-2 text-muted-foreground">{label}</dt>
          <dd className="border-b border-border pb-2 font-semibold break-words sm:pt-2">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
