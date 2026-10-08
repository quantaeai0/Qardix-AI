import { authApi } from "@/lib/api-client";

export type Role = "super_admin" | "marketing_manager" | "doctor";

export interface SessionInfo {
  userId: string;
  role: Role;
  profile: {
    id: string;
    display_name: string;
    login_id: string;
    company_id: string | null;
    specialty: string | null;
    status: string;
  };
  company: { id: string; name: string; code: string; status: string } | null;
  blocked: null | "account" | "company" | "no_profile";
}

export const ROLE_HOME: Record<Role, "/admin" | "/mm" | "/doctor"> = {
  super_admin: "/admin",
  marketing_manager: "/mm",
  doctor: "/doctor",
};

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  marketing_manager: "Marketing Manager",
  doctor: "Doctor",
};

export const BLOCK_MESSAGES = {
  company: "Your organisation access is currently inactive. Please contact your program administrator.",
  account: "Your Qardix AI account is currently inactive. Please contact your program administrator.",
  no_profile: "Your account is not provisioned yet. Please contact your program administrator.",
} as const;

export async function loadSessionInfo(): Promise<SessionInfo | null> {
  try {
    const user = await authApi.getMe();
    if (!user) return null;

    let blocked: SessionInfo["blocked"] = null;
    if (user.status !== "active") {
      blocked = "account";
    }

    const role = user.role as Role;
    const company = user.company_id
      ? { id: user.company_id, name: user.company_name || "—", code: "ORG", status: "active" }
      : null;

    return {
      userId: user.id,
      role,
      profile: {
        id: user.id,
        display_name: user.display_name,
        login_id: user.email,
        company_id: user.company_id,
        specialty: user.specialty,
        status: user.status,
      },
      company,
      blocked,
    };
  } catch (err) {
    return null;
  }
}
