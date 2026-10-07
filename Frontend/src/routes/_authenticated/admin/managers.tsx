import { createFileRoute } from "@tanstack/react-router";
import { AccountsAdmin } from "@/components/accounts-admin";

export const Route = createFileRoute("/_authenticated/admin/managers")({
  head: () => ({ meta: [{ title: "Marketing Managers — Qardix AI" }] }),
  component: () => <AccountsAdmin kind="marketing_manager" />,
});
