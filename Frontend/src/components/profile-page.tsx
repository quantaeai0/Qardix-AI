import { useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api-client";
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
    try {
      await apiRequest("/auth/password-reset", {
        method: "POST",
        body: JSON.stringify({ current_password: cur, new_password: pw }),
      });
      toast.success("Password updated successfully");
      setCur("");
      setPw("");
    } catch (err: any) {
      toast.error(err.message || "Could not update password");
    } finally {
      setBusy(false);
    }
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
            <Button disabled={busy}>{busy ? "Updating…" : "Update"}</Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
