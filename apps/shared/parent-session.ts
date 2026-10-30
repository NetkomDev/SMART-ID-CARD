import { PortalError, type PortalContext } from "./portal-session";

/** Parent credentials stay in an encrypted HttpOnly cookie, never browser storage. */
export class ParentSession {
  context: PortalContext | null = null;
  private csrf = "";
  private refreshing: Promise<void> | null = null;
  constructor(private base = "/api/v1") {}
  get connected() { return this.context !== null; }
  clear() { this.context = null; this.csrf = ""; }
  private async parse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) throw new PortalError(body?.error?.message ?? "Layanan belum dapat dihubungi.", res.status, body?.error?.code ?? "SERVER_UNAVAILABLE");
    return body.data;
  }
  async publicRequest<T>(path: string, body: unknown): Promise<T> {
    return this.parse<T>(await fetch(`${this.base}/parent/session/${path}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-csrf-token": this.csrf }, body: JSON.stringify(body) }));
  }
  async start(): Promise<boolean> {
    if (localStorage.getItem("aksis.parent.locked") === "1") return false;
    // Deliberately remove old shared sessions and unscoped personal caches.
    for (const key of Object.keys(localStorage)) if (key === "aksis.portal.PARENT.v1" || key.startsWith("aksis_parent_")) localStorage.removeItem(key);
    const url = new URL(location.href), fragment = new URLSearchParams(url.hash.slice(1));
    const access = fragment.get("access_token"), refresh = fragment.get("refresh_token");
    const recovery = fragment.get("type") === "recovery";
    if (url.hash || url.searchParams.has("token")) {
      url.hash = ""; url.searchParams.delete("token"); history.replaceState({}, "", url.pathname + url.search);
    }
    if (access && refresh) {
      await this.publicRequest("restore", { access_token: access, refresh_token: refresh });
      if (recovery) sessionStorage.setItem("aksis.parent.recovery", "1");
    }
    try {
      const csrf = await this.parse<{ csrf: string }>(await fetch(`${this.base}/parent/session/csrf`, { credentials: "same-origin", cache: "no-store" }));
      this.csrf = csrf.csrf;
      this.context = await this.request<PortalContext>("/parent/session/context");
      return true;
    } catch (error) {
      this.clear();
      if (error instanceof PortalError && error.status === 401) return false;
      throw error;
    }
  }
  async login(email: string, password: string) { await this.publicRequest("login", { email, password }); localStorage.removeItem("aksis.parent.locked"); return this.start(); }
  async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("x-csrf-token", this.csrf);
    if (init.body) headers.set("content-type", "application/json");
    const response = await fetch(`${this.base}${path}`, { ...init, credentials: "same-origin", headers, cache: "no-store" });
    if (response.status === 401 && retry && this.csrf) {
      const work = async () => { await this.publicRequest("refresh", {}); };
      if (!this.refreshing) this.refreshing = Promise.resolve(navigator.locks ? navigator.locks.request("aksis.parent.refresh.v2", work) : work()).finally(() => { this.refreshing = null; });
      await this.refreshing;
      return this.request<T>(path, init, false);
    }
    if (response.status === 401) this.clear();
    return this.parse<T>(response);
  }
  async logout() { try { await this.request("/parent/session/logout", { method: "POST", body: "{}" }); } finally { localStorage.setItem("aksis.parent.locked", "1"); this.clear(); } }
}
