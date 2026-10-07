import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Activity, Building2, ClipboardList, Download, FileText, LayoutDashboard, Megaphone, Settings, ShieldCheck, Stethoscope } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ROLE_HOME } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (context.session.role !== "super_admin") throw redirect({ to: ROLE_HOME[context.session.role] });
  },
  component: () => (
    <AppShell session={Route.useRouteContext().session} nav={NAV} profileTo="/admin/settings">
      <Outlet />
    </AppShell>
  ),
});

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/companies", label: "Companies", icon: Building2 },
  { to: "/admin/managers", label: "Marketing Managers", icon: Megaphone },
  { to: "/admin/doctors", label: "Doctors", icon: Stethoscope },
  { to: "/admin/assessments", label: "Patient Assessments", icon: ClipboardList },
  { to: "/admin/analyses", label: "ECG Analyses", icon: Activity },
  { to: "/admin/validations", label: "Doctor Validations", icon: ShieldCheck },
  { to: "/admin/reports", label: "Reports", icon: FileText },
  { to: "/admin/export", label: "Data Export", icon: Download },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];
