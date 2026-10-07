import { queryOptions } from "@tanstack/react-query";
import { companiesApi, usersApi, analyticsApi } from "@/lib/api-client";

export interface Company {
  id: string;
  name: string;
  code: string;
  primary_contact: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: "active" | "inactive";
  created_at: string;
}

export interface Account {
  id: string;
  company_id: string | null;
  display_name: string;
  login_id: string;
  email: string | null;
  specialty: string | null;
  status: "active" | "inactive";
  last_activity_at: string | null;
  created_at: string;
  role: string;
}

export const adminQuery = queryOptions({
  queryKey: ["admin-core"],
  queryFn: async () => {
    try {
      const [companies, users] = await Promise.all([
        companiesApi.list(),
        usersApi.list(),
      ]);

      const accounts = (users || []).map((u: any) => ({
        id: u.id,
        company_id: u.company_id,
        display_name: u.display_name,
        login_id: u.email,
        email: u.email,
        specialty: u.specialty,
        status: u.status,
        last_activity_at: u.last_activity_at,
        created_at: u.created_at,
        role: u.role,
      })) as Account[];

      return {
        companies: (companies || []) as Company[],
        accounts,
        events: [],
      };
    } catch (err) {
      console.error("Failed to load admin query from FastAPI:", err);
      return { companies: [], accounts: [], events: [] };
    }
  },
});
