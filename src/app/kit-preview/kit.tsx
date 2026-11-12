"use client";
// TEMPORARY visual-review page. Deleted before hand-off.
import { SearchX } from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { ImageUploader } from "@/components/image-uploader/image-uploader";
import { PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/money";
import { Pagination } from "@/components/pagination";
import { RatingStars } from "@/components/rating-stars";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VerifiedBadge } from "@/components/verified-badge";
import { WhatsAppShareButton } from "@/components/whatsapp/whatsapp-buttons";
import { routes, withQuery } from "@/lib/navigation";

export function Kit() {
  return (
    <div className="space-y-10">
      <PageHeader title="Component kit" description="Visual review only." actions={<Button size="lg">Primary action</Button>} back={{ href: routes.home, label: "Back" }} />
      <div className="flex flex-wrap items-center gap-3">
        <Button>Default</Button><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button><Button variant="destructive">Delete</Button><Button variant="accent">Accent</Button><Button variant="link">Link</Button>
        <Button size="sm">Small</Button><Button size="lg">Touch 44</Button><Button size="xl">XL</Button><Button disabled>Disabled</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Placeholder text" /><Input aria-invalid defaultValue="Invalid value" /></div>
      <div className="flex flex-wrap gap-2">
        <Badge>Default</Badge><Badge variant="secondary">Secondary</Badge><Badge variant="outline">Outline</Badge><Badge variant="success">Success</Badge><Badge variant="warning">Warning</Badge><Badge variant="destructive">Danger</Badge><Badge variant="accent">Accent</Badge>
      </div>
      <div className="flex flex-wrap gap-2"><VerifiedBadge kind="owner" /><VerifiedBadge kind="authorisation" /><VerifiedBadge kind="recently_confirmed" /><VerifiedBadge kind="owner" display="icon" /></div>
      <div className="flex flex-wrap gap-2">{["draft","pending_review","published","rejected","available","limited","coming_soon","new","suspended","something_else"].map((s) => <StatusBadge key={s} status={s} />)}</div>
      <div className="flex flex-wrap items-center gap-6 text-xl font-semibold"><Money amount={125000} suffix="/month" /><Money amount={8500} compact /><Money amount={null} /><RatingStars value={4.3} count={12} /><RatingStars value={null} /></div>
      <Tabs defaultValue="a"><TabsList><TabsTrigger value="a">Overview</TabsTrigger><TabsTrigger value="b">Rooms</TabsTrigger><TabsTrigger value="c">Reviews</TabsTrigger></TabsList><TabsContent value="a">Tab content</TabsContent></Tabs>
      <Card><CardHeader><CardTitle>Card title</CardTitle><CardDescription>Card description text.</CardDescription></CardHeader><CardContent>Card body content.</CardContent></Card>
      <div className="grid gap-5 md:grid-cols-2">
        <EmptyState icon={SearchX} title="No homes match yet" description="Try a wider budget or a nearby locality." action={<Button variant="outline" size="lg">Clear filters</Button>} />
        <ErrorState reference="abc123" onRetry={() => {}} />
      </div>
      <LoadingState variant="card-grid" count={3} />
      <LoadingState variant="list" count={3} />
      <Pagination page={6} totalPages={20} hrefForPage={(p) => withQuery(routes.search, { page: p })} />
      <div className="flex flex-wrap gap-3">
        <ConfirmDialog title="Delete this listing?" description="This cannot be undone." confirmLabel="Delete" destructive onConfirm={() => {}} trigger={<Button variant="outline" size="lg">Open confirm dialog</Button>} />
        <WhatsAppShareButton text="Look at this on ZUVIO" url="https://example.com/x" />
      </div>
      <ImageUploader maxBytes={8 * 1024 * 1024} upload={async (_f, ctx) => { for (let i = 1; i <= 10; i++) { await new Promise((r) => setTimeout(r, 150)); ctx.onProgress(i / 10); } return null; }} />
    </div>
  );
}
