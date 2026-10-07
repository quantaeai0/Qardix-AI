import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Download, FileText, History, LayoutDashboard, PlusCircle, UserCog } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ROLE_HOME } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/doctor")({
  beforeLoad: ({ context }) => {
    if (context.session.role !== "doctor") throw redirect({ to: ROLE_HOME[context.session.role] });
  },
  component: DoctorLayout,
});

const NAV = [
  { to: "/doctor", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/doctor/new", label: "New ECG Assessment", icon: PlusCircle },
  { to: "/doctor/reports", label: "My Reports", icon: FileText },
  { to: "/doctor/history", label: "My History", icon: History },
  { to: "/doctor/download", label: "Download Data", icon: Download },
  { to: "/doctor/profile", label: "Profile / Settings", icon: UserCog },
];

function DoctorLayout() {
  const { session } = Route.useRouteContext();
  return (
    <AppShell session={session} nav={NAV} profileTo="/doctor/profile">
      <Outlet />
    </AppShell>
  );
}
