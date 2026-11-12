import { AppShell } from "@/components/layout/app-shell";

/** The signed-in product frame. Reads no request data; each page guards itself. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
