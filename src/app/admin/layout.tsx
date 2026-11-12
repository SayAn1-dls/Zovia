import { DashboardShell } from "@/components/layout/dashboard-shell";

/** Admin frame. Reads no request data; every page re-checks staff access (staffPageContext). */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <DashboardShell area="admin">{children}</DashboardShell>;
}
