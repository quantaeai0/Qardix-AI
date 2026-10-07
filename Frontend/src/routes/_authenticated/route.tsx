import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { loadSessionInfo } from "@/lib/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const session = await loadSessionInfo();
    if (!session) throw redirect({ to: "/auth" });
    if (session.blocked) {
      localStorage.removeItem("qardix_access_token");
      localStorage.removeItem("qardix_refresh_token");
      throw redirect({ to: "/blocked", search: { reason: session.blocked } });
    }
    return { user: session.profile, session };
  },
  component: () => <Outlet />,
});
