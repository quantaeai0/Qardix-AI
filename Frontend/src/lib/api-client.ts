const API_BASE_URL = import.meta.env["VITE_API_URL"] || "http://localhost:8000/api/v1";

export function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("qardix_access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "Network request failed" }));
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  return response.json();
}

// ── Auth API ──
export const authApi = {
  login: (login_id: string, password: string) =>
    apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login_id, password }),
    }),

  getMe: () => apiRequest("/auth/me"),

  refreshToken: (refresh_token: string) =>
    apiRequest("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }),
};

// ── Companies API ──
export const companiesApi = {
  list: (status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (search) params.append("search", search);
    return apiRequest(`/companies?${params.toString()}`);
  },

  create: (data: any) =>
    apiRequest("/companies", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  toggleStatus: (id: string, status: string) =>
    apiRequest(`/companies/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};

// ── Users API ──
export const usersApi = {
  list: (role?: string, status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (role) params.append("role", role);
    if (status) params.append("status", status);
    if (search) params.append("search", search);
    return apiRequest(`/users?${params.toString()}`);
  },

  createDoctor: (data: any) =>
    apiRequest("/users/doctors", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  createMM: (data: any) =>
    apiRequest("/users/mms", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  toggleStatus: (id: string, status: string) =>
    apiRequest(`/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};

// ── Patient Assessment & ECG API ──
export const assessmentApi = {
  create: (data: any) =>
    apiRequest("/assessments", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  list: () => apiRequest("/assessments"),

  get: (id: string) => apiRequest(`/assessments/${id}`),

  uploadECG: async (assessment_id: string, file: File) => {
    const formData = new FormData();
    formData.append("assessment_id", assessment_id);
    formData.append("file", file);

    const token = localStorage.getItem("qardix_access_token");
    const response = await fetch(`${API_BASE_URL}/ecg/upload`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(err.detail || "ECG upload failed");
    }

    return response.json();
  },

  validate: (assessment_id: string, data: { status: string; corrected_interpretation?: string | null | undefined; notes?: string | null | undefined }) =>
    apiRequest(`/assessments/${assessment_id}/validate`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ── Analytics API ──
export const analyticsApi = {
  getDashboard: () => apiRequest("/analytics/dashboard"),
  getDoctorUsage: () => apiRequest("/analytics/doctors"),
  getEvents: (company_id?: string) => {
    const params = new URLSearchParams();
    if (company_id) params.append("company_id", company_id);
    return apiRequest(`/analytics/events?${params.toString()}`);
  },
};

