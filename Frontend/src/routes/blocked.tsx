import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import { z } from "zod";
import { BLOCK_MESSAGES } from "@/lib/session";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/blocked")({
  validateSearch: z.object({ reason: z.enum(["account", "company", "no_profile"]).catch("account") }),
  head: () => ({
    meta: [
      { title: "Access inactive — Qardix AI" },
      { name: "description", content: "Your Qardix AI access is currently inactive." },
      { property: "og:title", content: "Access inactive — Qardix AI" },
      { property: "og:description", content: "Contact your program administrator to restore access." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Blocked,
});

function Blocked() {
  const { reason } = Route.useSearch();
  return (
    <div className="ecg-grid flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-[var(--shadow-lift)]">
        <Logo className="justify-center" />
        <div className="mx-auto mt-8 grid size-14 place-items-center rounded-2xl bg-urgent/10 text-urgent"><ShieldOff className="size-7" /></div>
        <h1 className="mt-5 text-xl font-semibold text-foreground">Access inactive</h1>
        <p className="mt-2 text-sm text-muted-foreground">{BLOCK_MESSAGES[reason]}</p>
        <Button asChild className="mt-6"><Link to="/auth">Back to sign in</Link></Button>
      </div>
    </div>
  );
}
