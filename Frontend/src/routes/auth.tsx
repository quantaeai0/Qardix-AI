import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { authApi } from "@/lib/api-client";
import { loadSessionInfo, ROLE_HOME, BLOCK_MESSAGES } from "@/lib/session";
import { Logo, EcgLine } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Qardix AI" },
      { name: "description", content: "Secure sign in for Qardix AI doctors, marketing managers and administrators." },
      { property: "og:title", content: "Sign in — Qardix AI" },
      { property: "og:description", content: "Secure sign in for the Qardix AI ECG intelligence platform." },
    ],
  }),
  component: LoginPage,
});

const DEMO = [
  { role: "Super Admin", id: "admin@qardix.ai", pass: "Admin123!" },
  { role: "Marketing Manager", id: "mm@demopharma.com", pass: "Mm12345!" },
  { role: "Doctor 1", id: "doctor@demopharma.com", pass: "Doctor123!" },
  { role: "Doctor 2", id: "doctor2@demopharma.com", pass: "Doctor123!" },
];

const schema = z.object({
  email: z.string().trim().email("Enter a valid email/login ID").max(200),
  password: z.string().min(1, "Enter your password").max(64),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBlocked(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
    setLoading(true);

    try {
      const res = await authApi.login(parsed.data.email.toLowerCase(), parsed.data.password);
      localStorage.setItem("qardix_access_token", res.access_token);
      localStorage.setItem("qardix_refresh_token", res.refresh_token);

      const info = await loadSessionInfo();
      setLoading(false);

      if (!info || info.blocked) {
        localStorage.removeItem("qardix_access_token");
        localStorage.removeItem("qardix_refresh_token");
        setBlocked(BLOCK_MESSAGES[info?.blocked ?? "no_profile"]);
        return;
      }

      toast.success(`Welcome back, ${info.profile.display_name}!`);
      navigate({ to: ROLE_HOME[info.role], replace: true });
    } catch (err: any) {
      setLoading(false);
      toast.error(err.message || "Invalid login credentials");
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy p-12 text-navy-foreground lg:flex lg:flex-col">
        <div className="ecg-grid absolute inset-0 opacity-60" />
        <Link to="/" className="relative"><Logo light /></Link>
        <div className="relative mt-auto">
          <EcgLine animated className="mb-10 h-20 text-signal" />
          <h2 className="max-w-md text-4xl font-semibold leading-tight">Cardiac signal intelligence, reviewed by doctors.</h2>
          <p className="mt-4 max-w-md text-navy-foreground/70">Every AI-assisted result passes through mandatory doctor validation before a report is issued.</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-10 inline-block lg:hidden"><Logo /></Link>
          <h1 className="text-3xl font-semibold text-foreground">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in with the login ID issued by your program administrator.</p>

          {blocked && (
            <div className="mt-6 rounded-xl border border-urgent/30 bg-urgent/10 p-4 text-sm text-urgent">
              <p className="font-semibold">Access blocked</p>
              <p className="mt-1">{blocked}</p>
            </div>
          )}

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Login ID (Email)</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" className="h-11 pl-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="username" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="pw" type="password" className="h-11 pl-9" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
            </div>
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 size-4 animate-spin" />} Sign in
            </Button>
          </form>

          <div className="mt-8 rounded-2xl border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldCheck className="size-4 text-signal" /> Quick Demo Credentials
            </div>
            <div className="space-y-1">
              {DEMO.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => { setEmail(d.id); setPassword(d.pass); }}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="text-muted-foreground">{d.role}</span>
                  <span className="font-mono text-xs text-foreground">{d.id}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
