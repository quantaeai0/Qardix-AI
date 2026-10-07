import { usersApi } from "@/lib/api-client";

export interface CreateAccountInput {
  role: "marketing_manager" | "doctor";
  display_name: string;
  login_id: string;
  email?: string | null;
  company_id: string;
  specialty?: string | null;
  status: "active" | "inactive";
  temp_password: string;
}

export async function createAccount(data: CreateAccountInput) {
  try {
    let res: any;
    if (data.role === "doctor") {
      res = await usersApi.createDoctor({
        email: data.login_id,
        display_name: data.display_name,
        password: data.temp_password,
        company_id: data.company_id,
        specialty: data.specialty || undefined,
        status: data.status,
      });
    } else {
      res = await usersApi.createMM({
        email: data.login_id,
        display_name: data.display_name,
        password: data.temp_password,
        company_id: data.company_id,
        status: data.status,
      });
    }

    return { ok: true as const, id: res.id };
  } catch (err: any) {
    return { ok: false as const, error: err.message || "Failed to create user account" };
  }
}
