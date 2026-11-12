import { SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { listSettings, staffPageContext } from "@/features/admin/service";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Platform settings", robots: { index: false } };

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Thresholds and limits the database enforces." />
      <Suspense fallback={<LoadingState variant="list" count={6} label="Loading settings" />}>
        <SettingsBody />
      </Suspense>
    </>
  );
}

async function SettingsBody() {
  const ctx = await staffPageContext();
  const settings = await listSettings(ctx);
  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-muted px-4 py-3 text-sm">
        <span className="font-semibold">Read-only for now. </span>
        Changing a value needs the admin_update_setting() database function, which does not exist yet.
      </p>
      {settings.length === 0 ? (
        <EmptyState icon={SlidersHorizontal} title="No settings" />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-border" aria-label="Settings">
          {settings.map((setting) => (
            <li key={setting.key} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold break-all">{setting.key}</p>
                {setting.description ? <p className="text-sm text-muted-foreground">{setting.description}</p> : null}
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <p className="font-mono text-sm">{JSON.stringify(setting.value)}</p>
                <p className="text-xs text-muted-foreground">updated {formatDateTime(setting.updated_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
