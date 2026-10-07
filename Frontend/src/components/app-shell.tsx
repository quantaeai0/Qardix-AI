import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Bell, ChevronRight, LogOut, Menu, User, X, type LucideIcon } from "lucide-react";
import { Logo, EcgLine } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL, type SessionInfo } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface NavItem { to: string; label: string; icon: LucideIcon; exact?: boolean }

const CRUMB: Record<string, string> = {
  admin: "Super Admin", mm: "Marketing", doctor: "Doctor", companies: "Companies", managers: "Marketing Managers",
  doctors: "Doctors", assessments: "Patient Assessments", analyses: "ECG Analyses", validations: "Doctor Validations",
  reports: "Reports", export: "Data Export", settings: "Settings", analytics: "Usage Analytics", new: "New ECG Assessment",
  history: "My History", download: "Download Data", profile: "Profile", usage: "Export Usage",
};

export function AppShell({ session, nav, children, profileTo }: { session: SessionInfo; nav: NavItem[]; children: ReactNode; profileTo?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const segs = pathname.split("/").filter(Boolean);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initials = session.profile.display_name.replace("Dr. ", "").split(" ").map((p) => p[0]).slice(0, 2).join("");

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="relative overflow-hidden px-5 pb-5 pt-6">
        <Logo light />
        <EcgLine className="absolute -bottom-1 left-0 h-6 text-sidebar-primary/25" strokeWidth={1.5} />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {nav.map((item) => {
          const active = item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className={cn("size-4", active && "text-sidebar-primary")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="m-3 rounded-xl bg-sidebar-accent/70 p-3 text-xs">
        <p className="font-semibold text-sidebar-accent-foreground">{ROLE_LABEL[session.role]}</p>
        <p className="mt-0.5 truncate opacity-75">{session.company?.name ?? "Qardix AI Platform"}</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72">{sidebar}</div>
          <button className="absolute right-4 top-4 rounded-full bg-card p-2" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-4" /></button>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/85 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 hover:bg-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <nav className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground md:flex">
            {segs.map((s, i) => (
              <span key={i} className="flex items-center gap-1 truncate">
                {i > 0 && <ChevronRight className="size-3.5" />}
                <span className={cn(i === segs.length - 1 && "font-medium text-foreground")}>{CRUMB[s] ?? (s.length > 12 ? "Detail" : s)}</span>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button className="relative rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Notifications">
              <Bell className="size-5" />
              <span className="absolute right-2 top-2 size-2 rounded-full bg-signal" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-3 rounded-full py-1 pl-1 pr-3 hover:bg-muted">
                <span className="grid size-9 place-items-center rounded-full bg-navy text-xs font-semibold text-navy-foreground">{initials}</span>
                <span className="hidden text-left sm:block">
                  <span className="block text-sm font-semibold leading-tight text-foreground">{session.profile.display_name}</span>
                  <span className="block text-xs text-muted-foreground">{ROLE_LABEL[session.role]}{session.company ? ` · ${session.company.name}` : ""}</span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{session.profile.login_id}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {profileTo && (
                  <DropdownMenuItem onClick={() => navigate({ to: profileTo })}><User className="mr-2 size-4" /> Profile & Settings</DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={signOut}><LogOut className="mr-2 size-4" /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
