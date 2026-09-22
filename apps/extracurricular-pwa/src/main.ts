import "./style.css";

type Activity = { id: string; code: string; name: string; description?: string | null };
const app = document.querySelector<HTMLDivElement>("#app")!;
const API = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";
const token = () => sessionStorage.getItem("aksis.extracurricular.token");
const school = () => sessionStorage.getItem("aksis.extracurricular.school");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("authorization", `Bearer ${token() ?? ""}`);
  headers.set("x-school-id", school() ?? "");
  const response = await fetch(`${API}${path}`, { ...init, headers });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error?.message ?? "Layanan tidak tersedia");
  return body.data as T;
}

async function render() {
  try {
    const activities = await request<Activity[]>("/extracurriculars");
    app.innerHTML = `<header><b>AKSIS</b><span>Ekstrakurikuler</span></header><main><h1>Kelola kegiatan siswa</h1><p>Pilih kegiatan untuk pendaftaran cepat dan presensi sesi.</p><section>${activities.length ? activities.map((item) => `<article><small>${item.code}</small><h2>${item.name}</h2><p>${item.description ?? "Belum ada deskripsi"}</p><button data-id="${item.id}">Pendaftaran cepat</button></article>`).join("") : "<div class=empty>Belum ada kegiatan aktif.</div>"}</section><form id=enroll hidden><h2>Konfirmasi pendaftaran</h2><input name=student type=text required placeholder="Student UUID"><button>Konfirmasi & daftarkan</button><button type=button id=cancel>Batal</button><p id=message></p></form></main>`;
    let activityId = "";
    document.querySelectorAll<HTMLButtonElement>("[data-id]").forEach((button) => button.onclick = () => {
      activityId = button.dataset.id!; document.querySelector<HTMLFormElement>("#enroll")!.hidden = false;
    });
    document.querySelector<HTMLButtonElement>("#cancel")!.onclick = () => { document.querySelector<HTMLFormElement>("#enroll")!.hidden = true; };
    document.querySelector<HTMLFormElement>("#enroll")!.onsubmit = async (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement);
      try { await request(`/extracurriculars/${activityId}/members/fast-enroll`, { method: "POST", body: JSON.stringify({ student_id: data.get("student"), idempotency_key: crypto.randomUUID(), confirmed: true }) }); document.querySelector("#message")!.textContent = "Siswa berhasil didaftarkan."; }
      catch (error) { document.querySelector("#message")!.textContent = error instanceof Error ? error.message : "Pendaftaran gagal"; }
    };
  } catch (error) { app.innerHTML = `<main class=empty><h1>Akses diperlukan</h1><p>${error instanceof Error ? error.message : "Silakan masuk melalui portal sekolah."}</p></main>`; }
}
if ("serviceWorker" in navigator && import.meta.env.PROD) void navigator.serviceWorker.register("/sw.js");
void render();
