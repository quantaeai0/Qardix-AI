/** Deprecated: Database seeding and provisioning is managed by the FastAPI backend (app/database/seed.py). */
export async function runDemoBootstrap() {
  return { ok: true, skipped: true, message: "Provisioning handled by FastAPI PostgreSQL backend" };
}
