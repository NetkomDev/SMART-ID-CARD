import { clearSession, getSchoolId, getSession, setSession } from "./session";
import type { ApiEnvelope, ApiFailure, Session } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number, public requestId?: string) { super(message); }
}

async function parse<T>(response: Response): Promise<ApiEnvelope<T>> {
  if (response.status === 204) return { success: true, data: undefined as T };
  const payload = await response.json() as ApiEnvelope<T> | ApiFailure;
  if (!response.ok || !payload.success) {
    const failure = payload as ApiFailure;
    throw new ApiClientError(failure.error?.code ?? "SERVER_UNAVAILABLE", failure.error?.message ?? "Layanan tidak tersedia", response.status, failure.request_id);
  }
  return payload as ApiEnvelope<T>;
}

async function refreshSession(refreshToken: string): Promise<Session> {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refresh_token: refreshToken })
  });
  const envelope = await parse<Session>(response);
  setSession(envelope.data);
  return envelope.data;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<ApiEnvelope<T>> {
  let session = getSession();
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (session) headers.set("authorization", `Bearer ${session.access_token}`);
  const schoolId = getSchoolId();
  if (schoolId) headers.set("x-school-id", schoolId);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (response.status === 401 && retry && session?.refresh_token && !path.startsWith("/auth/")) {
    try {
      session = await refreshSession(session.refresh_token);
      return api<T>(path, init, false);
    } catch {
      clearSession();
      window.dispatchEvent(new CustomEvent("aksis:session-expired"));
    }
  }
  return parse<T>(response);
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password })
  });
  return parse<{ session: Session; user: { id: string; email?: string }; schools: Array<{ school_id: string; schools: unknown }> }>(response);
}
