import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { SIDEBAR_COOKIE } from "@/components/layout/sidebar-cookie";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const store = await cookies();
  const collapsed = store.get(SIDEBAR_COOKIE)?.value === "1";
  return <AppShell defaultCollapsed={collapsed}>{children}</AppShell>;
}
