import { createFileRoute } from "@tanstack/react-router";
import { AccountsAdmin } from "@/components/accounts-admin";

export const Route = createFileRoute("/_authenticated/admin/doctors/")({
  head: () => ({ meta: [{ title: "Doctors — Qardix AI" }] }),
  component: () => <AccountsAdmin kind="doctor" />,
});
