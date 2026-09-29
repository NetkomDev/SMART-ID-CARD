export type PortalRole = "WASTE_STAFF" | "LIBRARY_STAFF" | "TEACHER" | "PARENT";
export type PortalContext = { id: string; school_id: string; school_name: string; role_code: PortalRole; metadata: { class_id?: string; student_id?: string } };
type Session = { access_token: string; refresh_token: string; expires_at?: number };
type SavedAccess = { session: Session; portal: PortalContext };
export class PortalError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}

/** Persist the renewable session, never the printed QR secret. Keys are per portal. */
export class PortalSession {
  private key: string;
  private refreshing: Promise<void> | null = null;
  private pendingToken: string | null = null;
  constructor(private role: PortalRole, private base = "/api/v1") { this.key = `aksis.portal.${role}.v1`; }
  private saved(): SavedAccess | null {
    try {
      const value = JSON.parse(localStorage.getItem(this.key) ?? "null") as SavedAccess | null;
      if (!value?.session.access_token || !value.session.refresh_token || value.portal.role_code !== this.role) return null;
      return value;
    } catch { return null; }
  }
  get context(): PortalContext | null { return this.saved()?.portal ?? null; }
  get connected(): boolean { return Boolean(this.saved()); }
  private save(value: SavedAccess) { localStorage.setItem(this.key, JSON.stringify(value)); }
  clear() { localStorage.removeItem(this.key); }
  private async parse<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) throw new PortalError(body?.error?.message ?? "Layanan belum dapat dihubungi. Coba kembali.", response.status, body?.error?.code ?? "SERVER_UNAVAILABLE");
    return body.data as T;
  }
  private async publicRequest<T>(path: string, body: unknown): Promise<T> {
    return this.parse<T>(await fetch(`${this.base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  }
  async start(): Promise<boolean> {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const incoming = fragment.get("token") ?? url.searchParams.get("token");
    if (incoming) {
      this.pendingToken = incoming;
      this.clear(); // A newly scanned QR must never silently fall back to another tenant.
      url.searchParams.delete("token"); url.searchParams.delete("classId"); url.hash = "";
      window.history.replaceState({}, "", url.pathname + url.search);
    }
    if (this.pendingToken) {
      const access = await this.publicRequest<SavedAccess>("/auth/qr/login", { token: this.pendingToken, role_code: this.role });
      if (access.portal.role_code !== this.role) throw new PortalError("QR tidak sesuai aplikasi ini.", 403, "PORTAL_MISMATCH");
      this.save(access); this.pendingToken = null;
    }
    if (!this.saved()) return false;
    const portal = await this.request<PortalContext>("/auth/qr/context");
    if (portal.role_code !== this.role) { this.clear(); throw new PortalError("QR tidak sesuai aplikasi ini.", 403, "PORTAL_MISMATCH"); }
    this.save({ ...this.saved()!, portal });
    return true;
  }
  private async refresh(staleAccessToken: string): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const work = async () => {
      const saved = this.saved();
      if (!saved) throw new PortalError("Silakan pindai QR dari admin sekolah.", 401, "AUTH_REQUIRED");
      if (saved.session.access_token !== staleAccessToken) return;
      try {
        const session = await this.publicRequest<Session>("/auth/refresh", { refresh_token: saved.session.refresh_token });
        this.save({ ...saved, session });
      } catch (error) {
        if (error instanceof PortalError && error.status === 401) this.clear();
        throw error;
      }
    };
    // Serialize refresh-token rotation across tabs as well as concurrent requests.
    this.refreshing = Promise.resolve(typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(this.key, work) : work()).then(() => undefined).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const saved = this.saved();
    if (!saved) throw new PortalError("Pindai QR dari admin sekolah untuk membuka aplikasi.", 401, "AUTH_REQUIRED");
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${saved.session.access_token}`);
    headers.set("x-school-id", saved.portal.school_id);
    if (init.body) headers.set("content-type", "application/json");
    const response = await fetch(`${this.base}${path}`, { ...init, headers });
    if (response.status === 401) {
      const body = await response.clone().json().catch(() => null);
      if (body?.error?.code === "PORTAL_ACCESS_INVALID") { this.clear(); return this.parse<T>(response); }
      if (retry) {
        await this.refresh(saved.session.access_token);
        if (this.saved()?.portal.id !== saved.portal.id) throw new PortalError("Akses portal berubah. Muat ulang halaman sebelum melanjutkan.", 403, "PORTAL_MISMATCH");
        return this.request<T>(path, init, false);
      }
      this.clear();
    }
    return this.parse<T>(response);
  }
  async logout(): Promise<void> {
    const saved = this.saved();
    try { if (saved) await this.request("/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: saved.session.refresh_token }) }); }
    finally { this.clear(); }
  }
}
