import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getAppInfo } from "@/server/app-info";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const info = await getAppInfo();
  if (!info) redirect("/login");
  return <AppShell info={info}>{children}</AppShell>;
}
