import { DashboardShell } from "@/components/layout/dashboard-shell";

/** Owner portal frame. Reads no request data; every page guards itself (ownerPageContext). */
export default function OwnerPortalLayout({ children }: LayoutProps<"/owner">) {
  return <DashboardShell area="owner">{children}</DashboardShell>;
}
