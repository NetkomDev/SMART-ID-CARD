type Access = { platform_admin?: boolean; user: { id: string }; session: { access_token: string; refresh_token: string }; schools: Array<{ school_id: string; schools: { name: string } }> };
/** Dedicated consoles use an explicit login; credentials are never pasted into DevTools. */
export class OperatorSession {
  private base = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
  constructor(private namespace: string) {}
  get scope() { return `${sessionStorage.getItem(`${this.namespace}.user`) ?? "none"}.${sessionStorage.getItem(`${this.namespace}.school`) ?? "none"}`; }
  private headers() { return { authorization: `Bearer ${sessionStorage.getItem(`${this.namespace}.token`) ?? ""}`, "x-school-id": sessionStorage.getItem(`${this.namespace}.school`) ?? "", "content-type": "application/json" }; }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.base}${path}`, { ...init, headers: { ...this.headers(), ...init.headers }, cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) throw new Error(body?.error?.message ?? "Sesi berakhir atau layanan tidak tersedia. Masuk kembali.");
    return body.data;
  }
  async open(): Promise<void> {
    const panel = document.createElement("section");
    panel.innerHTML = `<form><h2>Masuk ke konsol</h2><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Masuk</button><p role="status"></p></form>`;
    document.body.prepend(panel);
    // Require verification each page load, don't render old-school snapshots before login.
    await new Promise<void>(resolve => {
      const form = panel.querySelector("form")!;
      form.onsubmit = async e => {
        e.preventDefault(); const fields = new FormData(form);
        try {
          const response = await fetch(`${this.base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: fields.get("email"), password: fields.get("password") }) });
          const body = await response.json();
          if (!response.ok || !body.success) throw Error(body.error?.message ?? "Gagal masuk.");
          const data = body.data as Access;
          sessionStorage.setItem(`${this.namespace}.token`, data.session.access_token);
          sessionStorage.setItem(`${this.namespace}.refresh`, data.session.refresh_token);
          sessionStorage.setItem(`${this.namespace}.user`, data.user.id);
          form.replaceChildren();
          if (!data.schools.length && data.platform_admin) {
            const schools = await fetch(`${this.base}/platform/schools?page=1&page_size=500`, {headers:{authorization:`Bearer ${data.session.access_token}`}}).then(r=>r.json());
            if (!schools.success) throw Error("Daftar sekolah belum tersedia.");
            data.schools = schools.data.map((school:{id:string;name:string})=>({school_id:school.id,schools:{name:school.name}}));
          }
          const select = document.createElement("select");
          for (const school of data.schools) { const option = document.createElement("option"); option.value = school.school_id; option.textContent = school.schools.name; select.append(option); }
          if (!select.options.length) throw Error("Tidak ada sekolah aktif untuk akun ini.");
          const button = document.createElement("button"); button.type = "button"; button.textContent = "Buka sekolah";
          button.onclick = () => { sessionStorage.setItem(`${this.namespace}.school`, select.value); panel.remove(); resolve(); };
          form.append(select, button);
        } catch (error) { let status = form.querySelector("p"); if (!status) { status = document.createElement("p"); form.append(status); } status.textContent = error instanceof Error ? error.message : "Gagal masuk."; }
      };
    });
    const logout = document.createElement("button"); logout.textContent = "Keluar";
    logout.onclick = async () => {
      try { await this.request("/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: sessionStorage.getItem(`${this.namespace}.refresh`) }) }); }
      finally { for (const key of Object.keys(sessionStorage)) if (key.startsWith(`${this.namespace}.`)) sessionStorage.removeItem(key); location.reload(); }
    };
    document.body.append(logout);
  }
}
