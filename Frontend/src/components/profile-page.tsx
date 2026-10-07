import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { toInternalPassword } from "@/lib/auth-password";
import { ROLE_LABEL, type SessionInfo } from "@/lib/session";
import { PageHeader, Panel, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfilePage({ session }: { session: SessionInfo }) {
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function change(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 4 || pw.length > 64) return void toast.error("Password must be 4–64 characters");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: toInternalPassword(pw), current_password: toInternalPassword(cur) } as never);
    setBusy(false);
    if (error) return void toast.error(error.message);
    await supabase.from("profiles").update({ force_password_reset: false }).eq("id", session.userId);
    toast.success("Password updated");
    setCur(""); setPw("");
  }
  const p = session.profile;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Profile & Settings" />
      <div className="grid gap-6">
        <Panel title="Account">
          <dl className="grid gap-4 sm:grid-cols-2">
            {[["Name", p.display_name], ["Login ID", p.login_id], ["Role", ROLE_LABEL[session.role]], ["Company", session.company?.name ?? "Qardix AI Platform"], ["Specialty", p.specialty ?? "—"]].map(([k, v]) => (
              <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
            ))}
            <div><dt className="text-xs text-muted-foreground">Status</dt><dd><StatusBadge status={p.status} /></dd></div>
          </dl>
        </Panel>
        <Panel title="Change password">
          <form onSubmit={change} className="grid gap-4 sm:grid-cols-3 sm:items-end">
            <div className="space-y-1.5"><Label>Current</Label><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>New</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <Button disabled={busy}>Update</Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
