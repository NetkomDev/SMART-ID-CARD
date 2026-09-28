import { gateIntro, gateHelp } from "../../shared/portal-ui";
import "./style.css";
import { PortalError, PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt, offerInstall } from "../../shared/install-prompt";
import { Html5Qrcode } from "html5-qrcode";
const portal = new PortalSession("LIBRARY_STAFF", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
setupInstallPrompt("Perpustakaan", import.meta.env.BASE_URL, import.meta.env.PROD);
type Visit = { event_id: string; card_uid: string; occurred_at: string; local_sequence: number; metadata: Record<string, unknown> };
const form = document.querySelector<HTMLFormElement>("#scan")!;
const card = document.querySelector<HTMLInputElement>("#card")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const queued = document.querySelector("#queued")!;
const gate = document.createElement("section");
gate.id = "gate"; gate.className = "portal-gate";
gate.innerHTML = gateIntro("Selamat datang di perpustakaan", "Catat kunjungan siswa dengan QR kartu atau reader kartu sekolah.");
const message = document.createElement("p");
message.style.fontWeight = "600";
const retry = document.createElement("button"); retry.textContent = "Coba lagi";
gate.append(message, retry); gate.insertAdjacentHTML("beforeend", gateHelp); document.querySelector("header")!.after(gate);
const panel = document.getElementById("panel")!;
const logout = document.getElementById("logout")!;
const queueKey = () => `aksis.library.queue.${portal.context?.id ?? "none"}`;
function queue(key = queueKey()): Visit[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]") as Visit[]; } catch { return []; }
}
function save(items: Visit[], key = queueKey()) { localStorage.setItem(key, JSON.stringify(items)); queued.textContent = String(items.length); }
let syncing: Promise<void> | null = null;
async function sync() {
  if (syncing) return syncing;
  const work = async () => {
    const key = queueKey();
    for (const visit of queue(key)) {
      await portal.request("/library/visits", { method: "POST", body: JSON.stringify(visit) });
      // Remove only acknowledged IDs; scans added during the request remain queued.
      save(queue(key).filter(item => item.event_id !== visit.event_id), key);
    }
    status.value = "Semua kunjungan tersinkronisasi";
  };
  syncing = Promise.resolve(navigator.locks ? navigator.locks.request(queueKey(), work) : work()).then(() => undefined).finally(() => { syncing = null; });
  return syncing;
}
form.onsubmit = async event => {
  event.preventDefault();
  const key = queueKey();
  const visit: Visit = { event_id: crypto.randomUUID(), card_uid: card.value.trim(), occurred_at: new Date().toISOString(), local_sequence: Date.now(), metadata: { terminal: "library-pwa" } };
  try {
    const result = await portal.request<{student_name?:string}>("/library/visits", { method: "POST", body: JSON.stringify(visit) });
    status.value = result.student_name ? `Kunjungan tercatat: ${result.student_name}` : "Kunjungan tercatat";
  } catch (error) {
    if (error instanceof PortalError && error.status < 500) { status.value = error.message; return; }
    save([...queue(key), visit], key); status.value = "Koneksi tertunda — kunjungan tersimpan di perangkat";
  }
  card.value = ""; card.focus();
};
const showError = (error: unknown) => {
  status.value = error instanceof Error ? error.message : "Sinkronisasi tertunda";
  status.className = "error";
};

document.querySelector<HTMLButtonElement>("#sync")!.onclick = () => void sync().catch(showError);
window.addEventListener("online", () => { if (portal.connected) void sync().catch(showError); });

let html5QrCode: Html5Qrcode | null = null;
let isScanning = false;

async function stopCameraScanner() {
  if (html5QrCode && isScanning) {
    try { await html5QrCode.stop(); } catch (e) {}
    isScanning = false;
    document.getElementById("qr-reader")!.style.display = "none";
    document.getElementById("btn-toggle-camera")!.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      Buka Kamera Scanner
    `;
  }
}

async function startCameraScanner() {
  if (!html5QrCode) html5QrCode = new Html5Qrcode("qr-reader");
  try {
    document.getElementById("qr-reader")!.style.display = "block";
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    const onScanSuccess = async (decodedText: string) => {
      card.value = decodedText;
      await stopCameraScanner();
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    };

    try {
      await html5QrCode.start({ facingMode: { exact: "environment" } }, config, onScanSuccess, () => {});
    } catch (e) {
      await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, () => {});
    }

    isScanning = true;
    document.getElementById("btn-toggle-camera")!.innerHTML = "Tutup Kamera";
  } catch (err) {
    status.value = "Kamera tidak dapat diakses atau tidak ditemukan.";
    status.className = "error";
    document.getElementById("qr-reader")!.style.display = "none";
  }
}

document.getElementById("btn-toggle-camera")!.addEventListener("click", () => {
  if (isScanning) stopCameraScanner();
  else startCameraScanner();
});

async function start() {
  panel.hidden = true; gate.hidden = false;
  message.textContent = "Membuka akses sekolah…"; retry.disabled = true;
  try {
    if (!await portal.start()) { message.textContent = "Pindai QR Perpustakaan dari admin sekolah untuk masuk."; return; }
    gate.hidden = true; panel.hidden = false;
    document.querySelector("header span")!.textContent = `Perpustakaan · ${portal.context!.school_name}`;
    queued.textContent = String(queue().length); offerInstall(); card.focus();
    if (queue().length) void sync().catch(showError);
  } catch (error) { message.textContent = error instanceof Error ? error.message : "Belum dapat terhubung."; }
  finally { retry.disabled = false; }
}

retry.onclick = () => void start();
logout.onclick = async () => {
  await stopCameraScanner();
  await portal.logout().catch(() => undefined);
  panel.hidden = true;
  gate.hidden = false;
  message.textContent = "Anda sudah keluar. Pindai QR untuk masuk kembali.";
};

void start();
