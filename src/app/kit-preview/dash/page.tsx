import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
export default function Page() { return <DashboardShell area="admin"><PageHeader title="Overview" description="Dashboard shell review." /><LoadingState variant="list" count={4} /></DashboardShell>; }
