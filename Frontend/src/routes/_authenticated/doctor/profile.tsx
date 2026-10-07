import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/profile-page";

export const Route = createFileRoute("/_authenticated/doctor/profile")({
  head: () => ({ meta: [{ title: "Profile — Qardix AI" }] }),
  component: () => <ProfilePage session={Route.useRouteContext().session} />,
});
