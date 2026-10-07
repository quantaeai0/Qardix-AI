import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { BarChart3, Download, LayoutDashboard, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ROLE_HOME } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/mm")({
  beforeLoad: ({ context }) => {
    if (context.session.role !== "marketing_manager") throw redirect({ to: ROLE_HOME[context.session.role] });
  },
  component: () => (
    <AppShell session={Route.useRouteContext().session} nav={NAV}>
      <Outlet />
    </AppShell>
  ),
});

const NAV = [
  { to: "/mm", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/mm/doctors", label: "Doctors", icon: Users },
  { to: "/mm/analytics", label: "Usage Analytics", icon: BarChart3 },
  { to: "/mm/usage", label: "Export Usage", icon: Download },
];
