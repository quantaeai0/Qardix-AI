import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api-client";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/request-demo")({
  head: () => ({
    meta: [
      { title: "Request a Demo — Qardix AI" },
      { name: "description", content: "Request a Qardix AI demo for your pharma programme or clinical team." },
      { property: "og:title", content: "Request a Demo — Qardix AI" },
      { property: "og:description", content: "See AI-assisted ECG intelligence with doctor validation in action." },
    ],
  }),
  component: RequestDemo,
});

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  organisation: z.string().trim().max(150),
  message: z.string().trim().max(1000),
});

function RequestDemo() {
  const [form, setForm] = useState({ name: "", email: "", organisation: "", message: "" });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = schema.safeParse(form);
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);
    try {
      await apiRequest("/public/request-demo", {
        method: "POST",
        body: JSON.stringify(p.data),
      });
      setBusy(false);
      setDone(true);
    } catch (err: any) {
      setBusy(false);
      toast.error(err.message || "Could not submit. Please try again.");
    }
  }

  return (
    <div className="ecg-grid min-h-screen px-4 py-10">
      <div className="mx-auto max-w-xl">
        <Link to="/"><Logo /></Link>
        <div className="mt-10 rounded-3xl border bg-card p-8 shadow-[var(--shadow-lift)]">
          {done ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto size-12 text-routine" />
              <h1 className="mt-4 text-2xl font-semibold">Thank you</h1>
              <p className="mt-2 text-muted-foreground">Our team will contact you shortly to schedule your demo.</p>
              <Button asChild className="mt-6"><Link to="/">Back to home</Link></Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h1 className="text-2xl font-semibold">Request a demo</h1>
              <p className="text-sm text-muted-foreground">Tell us about your programme and we'll set up a guided walkthrough.</p>
              {(["name", "email", "organisation"] as const).map((k) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={k} className="capitalize">{k}</Label>
                  <Input id={k} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>Submit request</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
