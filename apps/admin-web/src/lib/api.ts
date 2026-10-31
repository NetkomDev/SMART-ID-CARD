import { ReadCache, cacheableRead } from "./read-cache";
import {
  clearSession,
  getSchoolId,
  getSession,
  getSessionRevision,
  setSession,
} from "./session";
import type { ApiEnvelope, ApiFailure, Session } from "./types";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
  }
}

async function parse<T>(response: Response): Promise<ApiEnvelope<T>> {
  if (response.status === 204) return { success: true, data: undefined as T };
  const payload = (await response.json()) as ApiEnvelope<T> | ApiFailure;
  if (!response.ok || !payload.success) {
    const failure = payload as ApiFailure;
    throw new ApiClientError(
      failure.error?.code ?? "SERVER_UNAVAILABLE",
      failure.error?.message ?? "Layanan tidak tersedia",
      response.status,
      failure.request_id,
    );
  }
  return payload as ApiEnvelope<T>;
}

async function performRefresh(refreshToken: string): Promise<Session> {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const envelope = await parse<Session>(response);
  if (getSession()?.refresh_token !== refreshToken)
    throw new ApiClientError("NAVIGATION_CANCELLED", "Sesi berubah.", 0);
  setSession(envelope.data, true);
  return envelope.data;
}

const reads = new ReadCache();
let scope = "";
let refreshing: Promise<Session> | null = null;
let refreshKey = "";
function refreshSession(token: string): Promise<Session> {
  if (refreshing && refreshKey !== token)
    throw new ApiClientError("NAVIGATION_CANCELLED", "Sesi berubah.", 0);
  if (!refreshing) {
    refreshKey = token;
    refreshing = performRefresh(token).finally(() => {
      refreshing = null;
      refreshKey = "";
    });
  }
  return refreshing;
}
export function invalidateReads(): void {
  reads.clear();
}
export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<ApiEnvelope<T>> {
  const session = getSession();
  const identity = `${session?.access_token ?? ""}:${getSchoolId() ?? ""}`;
  if (identity !== scope) {
    reads.clear();
    scope = identity;
  }
  const method = (init.method ?? "GET").toUpperCase();
  const route = location.pathname,
    revision = getSessionRevision();
  const cache =
    method === "GET" &&
    cacheableRead(path) &&
    !init.signal &&
    init.cache !== "no-store";
  if (method !== "GET") reads.clear();
  try {
    const school =
      new Headers(init.headers).get("x-school-id") ?? getSchoolId();
    const result = cache
      ? await reads.read<ApiEnvelope<T>>(`${school}:${path}`, () =>
          requestApi<T>(path, init, retry),
        )
      : await requestApi<T>(path, init, retry);
    if (
      revision !== getSessionRevision() ||
      (method === "GET" && route !== location.pathname)
    )
      throw new ApiClientError("NAVIGATION_CANCELLED", "Navigasi berubah.", 0);
    return result;
  } finally {
    if (method !== "GET") reads.clear();
  }
}

async function requestApi<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<ApiEnvelope<T>> {
  let session = getSession();
  const revision = getSessionRevision();
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (session) headers.set("authorization", `Bearer ${session.access_token}`);
  const schoolId = getSchoolId();
  if (schoolId && !headers.has("x-school-id"))
    headers.set("x-school-id", schoolId);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (revision !== getSessionRevision() || schoolId !== getSchoolId())
    throw new ApiClientError(
      "NAVIGATION_CANCELLED",
      "Sesi atau sekolah berubah.",
      0,
    );
  if (
    response.status === 401 &&
    retry &&
    session?.refresh_token &&
    !path.startsWith("/auth/")
  ) {
    try {
      if (getSession()?.access_token !== session.access_token)
        return requestApi<T>(path, init, false);
      session = await refreshSession(session.refresh_token);
      return requestApi<T>(path, init, false);
    } catch (error) {
      if (getSession()?.refresh_token === session.refresh_token) {
        reads.clear();
        clearSession();
        window.dispatchEvent(new CustomEvent("aksis:session-expired"));
      }
      if (
        error instanceof ApiClientError &&
        error.code === "NAVIGATION_CANCELLED"
      )
        throw error;
    }
  }
  return parse<T>(response);
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parse<{
    platform_admin: boolean;
    session: Session;
    user: { id: string; email?: string };
    schools: Array<{ school_id: string; schools: unknown }>;
  }>(response);
}
