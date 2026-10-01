import { gateIntro, gateHelp } from "../../shared/portal-ui";
import "./style.css";
import { PortalError, PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt, offerInstall } from "../../shared/install-prompt";
const portal = new PortalSession("LIBRARY_STAFF", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
setupInstallPrompt("Perpustakaan", import.meta.env.BASE_URL, import.meta.env.PROD);
type Visit = { event_id: string; card_uid: string; occurred_at: string; local_sequence: number; metadata: Record<string, unknown> };
const form = document.querySelector<HTMLFormElement>("#scan")!;
const card = document.querySelector<HTMLInputElement>("#card")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const queued = document.querySelector("#queued")!;
const studentResult = document.querySelector<HTMLElement>("#student-result")!;
const studentName = document.querySelector<HTMLElement>("#student-name")!;
const visitTime = document.querySelector<HTMLElement>("#visit-time")!;
const todayVisits = document.querySelector<HTMLElement>("#today-visits")!;
const activeClasses = document.querySelector<HTMLElement>("#active-classes")!;
const gate = document.createElement("section");
gate.id = "gate"; gate.className = "portal-gate";
gate.innerHTML = gateIntro("Selamat datang di perpustakaan", "Catat kunjungan siswa dengan QR kartu atau reader kartu sekolah.");
const message = document.createElement("p");
message.style.fontWeight = "600";
const retry = document.createElement("button"); retry.textContent = "Coba lagi";
const scanBtn = document.createElement("button"); scanBtn.textContent = "Pindai QR Akses"; scanBtn.style.marginTop = "1rem"; scanBtn.style.width = "100%";
const scannerContainer = document.createElement("div"); scannerContainer.style.display = "none"; scannerContainer.style.marginTop = "1rem";
const readerDiv = document.createElement("div"); readerDiv.id = "login-qr-reader";
const cancelBtn = document.createElement("button"); cancelBtn.textContent = "Batal Scan"; cancelBtn.className = "btn-secondary"; cancelBtn.style.marginTop = "0.5rem"; cancelBtn.style.width = "100%";
scannerContainer.append(readerDiv, cancelBtn);
gate.append(message, retry, scannerContainer, scanBtn); gate.insertAdjacentHTML("beforeend", gateHelp); document.querySelector("header")!.after(gate);

let loginScanner: any = null;
scanBtn.onclick = async () => {
  scanBtn.style.display = "none"; retry.style.display = "none"; scannerContainer.style.display = "block";
  try {
    if (!loginScanner) {
      const { Html5Qrcode } = await import("html5-qrcode");
      loginScanner = new Html5Qrcode("login-qr-reader");
    }
    await loginScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (decoded: string) => {
      try {
        const url = new URL(decoded);
        if (url.hash.includes("token=") || url.searchParams.has("token")) {
          void loginScanner?.stop().catch(() => {});
          window.location.href = decoded;
        }
      } catch {}
    }, () => undefined);
  } catch {
    scannerContainer.style.display = "none"; scanBtn.style.display = "block";
    message.textContent = "Kamera tidak dapat diakses.";
  }
};
cancelBtn.onclick = async () => {
  if (loginScanner) { try { await loginScanner.stop(); } catch {} }
  scannerContainer.style.display = "none"; scanBtn.style.display = "block"; retry.style.display = "inline-block";
};
const panel = document.getElementById("panel")!;
const queueKey = () => `aksis.library.queue.${portal.context?.id ?? "none"}`;
function queue(key = queueKey()): Visit[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]") as Visit[]; } catch { return []; }
}
function save(items: Visit[], key = queueKey()) { localStorage.setItem(key, JSON.stringify(items)); queued.textContent = String(items.length); }
let syncing: Promise<void> | null = null;
type LibrarySummary = { class_id: string | null; class_name: string; total: number };
const dayRange = () => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};
async function loadDailySummary() {
  const { start, end } = dayRange();
  try {
    const rows = await portal.request<LibrarySummary[]>(`/library/summary?occurred_from=${encodeURIComponent(start)}&occurred_to=${encodeURIComponent(end)}`);
    todayVisits.textContent = String(rows.reduce((total, row) => total + row.total, 0));
    activeClasses.textContent = String(rows.filter(row => row.total > 0).length);
  } catch {
    todayVisits.textContent = "—";
    activeClasses.textContent = "—";
  }
}
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
    await loadDailySummary();
  };
  syncing = Promise.resolve(navigator.locks ? navigator.locks.request(queueKey(), work) : work()).then(() => undefined).finally(() => { syncing = null; });
  return syncing;
}
form.onsubmit = async event => {
  event.preventDefault();
  const key = queueKey();
  const visit: Visit = { event_id: crypto.randomUUID(), card_uid: card.value.trim(), occurred_at: new Date().toISOString(), local_sequence: Date.now(), metadata: { terminal: "library-pwa" } };
  try {
    const result = await portal.request<{student_name?:string;duplicate?:boolean}>("/library/visits", { method: "POST", body: JSON.stringify(visit) });
    status.value = result.student_name ? `Kunjungan tercatat: ${result.student_name}` : "Kunjungan tercatat";
    studentName.textContent = result.student_name ?? "Siswa";
    visitTime.textContent = `${result.duplicate ? "Sudah tercatat" : "Tercatat"} pukul ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
    studentResult.hidden = false;
    void loadDailySummary();
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

let html5QrCode: any = null;
let isScanning = false;

async function stopCameraScanner() {
  if (html5QrCode && isScanning) {
    try { await html5QrCode.stop(); } catch (e) {}
    isScanning = false;
    document.getElementById("qr-reader")!.style.display = "none";
    const ph = document.getElementById("scanner-placeholder");
    if (ph) ph.style.display = "block";
    document.getElementById("btn-toggle-camera")!.textContent = "Buka Kamera Scanner";
  }
}

async function startCameraScanner() {
  if (!html5QrCode) {
    const { Html5Qrcode } = await import("html5-qrcode");
    html5QrCode = new Html5Qrcode("qr-reader");
  }
  try {
    const ph = document.getElementById("scanner-placeholder");
    if (ph) ph.style.display = "none";
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
    document.getElementById("btn-toggle-camera")!.textContent = "Tutup Kamera";
  } catch (err) {
    status.value = "Kamera tidak dapat diakses atau tidak ditemukan.";
    status.className = "error";
    document.getElementById("qr-reader")!.style.display = "none";
    const ph = document.getElementById("scanner-placeholder");
    if (ph) ph.style.display = "block";
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
    if (!await portal.start()) {
      message.textContent = "Pindai QR Akses dari admin sekolah untuk masuk.";
      scanBtn.style.display = "block"; retry.style.display = "none";
      return;
    }
    gate.hidden = true; panel.hidden = false;
    const libSchool = document.querySelector("#library-school");
    if (libSchool) libSchool.textContent = portal.context!.school_name;
    queued.textContent = String(queue().length); offerInstall(); card.focus();
    void loadDailySummary();
    if (queue().length) void sync().catch(showError);
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "Belum dapat terhubung.";
    scanBtn.style.display = "block"; retry.style.display = "inline-block";
  }
  finally { retry.disabled = false; }
}

retry.onclick = () => void start();

void start();
