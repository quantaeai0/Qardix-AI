import { createFileRoute } from "@tanstack/react-router";

// Idempotent one-time demo provisioning. No-op once demo accounts exist.
export const Route = createFileRoute("/api/public/demo-setup")({
  server: {
    handlers: {
      POST: async () => {
        const { runDemoBootstrap } = await import("@/lib/demo-bootstrap.server");
        const res = await runDemoBootstrap();
        return Response.json(res);
      },
    },
  },
});
