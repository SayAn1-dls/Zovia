import { Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/pagination";
import { ContactMessageCard } from "@/features/admin/components/contact-message-card";
import { CONTACT_STATUS_LABELS, CONTACT_STATUSES, parsePage, type ContactStatus } from "@/features/admin/schemas";
import { listContactMessages, staffPageContext } from "@/features/admin/service";
import { routes, withQuery } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Contact messages", robots: { index: false } };

export default function AdminContactMessagesPage({ searchParams }: PageProps<"/admin/contact-messages">) {
  return (
    <>
      <PageHeader title="Contact messages" description="Messages from the contact form. Set a status and keep a short note for the team." />
      <Suspense fallback={<LoadingState variant="list" count={4} label="Loading messages" />}>
        <MessagesBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function MessagesBody({ searchParams }: { searchParams: PageProps<"/admin/contact-messages">["searchParams"] }) {
  const ctx = await staffPageContext();
  const query = await searchParams;
  const status = typeof query.status === "string" && (CONTACT_STATUSES as readonly string[]).includes(query.status) ? (query.status as ContactStatus) : null;
  const page = parsePage(query.page);
  const data = await listContactMessages(ctx, status, page);
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
  const filters: (ContactStatus | null)[] = [null, ...CONTACT_STATUSES];

  return (
    <div className="space-y-5">
      <nav aria-label="Filter by status" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2">
          {filters.map((value) => (
            <li key={value ?? "all"}>
              <Link
                href={withQuery(routes.adminContactMessages, { status: value })}
                aria-current={value === status ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold whitespace-nowrap",
                  value === status ? "border-ink bg-ink text-white" : "border-foreground/20 bg-card hover:border-foreground",
                )}
              >
                {value ? CONTACT_STATUS_LABELS[value] : "All"}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {data.rows.length === 0 ? (
        <EmptyState icon={Mail} title="No messages" description="Messages sent through the contact page appear here." />
      ) : (
        <ul className="space-y-4" aria-label="Contact messages">
          {data.rows.map((message) => (
            <ContactMessageCard key={`${message.id}-${message.status}-${message.staff_note}`} message={message} />
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} hrefForPage={(p) => withQuery(routes.adminContactMessages, { status, page: p })} />
    </div>
  );
}
