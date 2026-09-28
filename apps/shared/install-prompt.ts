interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let deferred: InstallEvent | null = null;
let ready = false;
let title = "AKSIS";
let shown = false;
const installed = () => window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

export function setupInstallPrompt(appName: string, base: string, production = true) {
  title = appName;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); deferred = event as InstallEvent;
    const button = document.querySelector<HTMLButtonElement>("#aksis-install-action");
    if (button) { button.hidden = false; button.textContent = "Pasang aplikasi"; }
    if (ready) show();
  });
  window.addEventListener("appinstalled", () => document.querySelector("#aksis-install")?.remove());
  if (production && "serviceWorker" in navigator && window.isSecureContext) {
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => undefined);
  }
}
export function offerInstall() { ready = true; show(); }
function show() {
  if (shown || installed()) return;
  shown = true;
  const dialog = document.createElement("dialog");
  dialog.id = "aksis-install";
  dialog.setAttribute("aria-labelledby", "aksis-install-title");
  const heading = document.createElement("h2"); heading.id = "aksis-install-title"; heading.textContent = `Simpan ${title}`;
  const text = document.createElement("p"); text.textContent = "Tambahkan ke layar utama agar berikutnya cukup ketuk ikon aplikasi. Akses Anda sudah tersimpan di perangkat ini.";
  const instruction = document.createElement("p");
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  instruction.textContent = ios ? "Di Safari, ketuk Bagikan, pilih Tambahkan ke Layar Utama, lalu Tambah." : "Jika tombol pasang belum tersedia, buka menu browser lalu pilih Instal aplikasi atau Tambahkan ke layar utama.";
  instruction.style.fontSize = "14px";
  const button = document.createElement("button"); button.id = "aksis-install-action"; button.textContent = "Pasang aplikasi"; button.hidden = !deferred;
  button.onclick = async () => {
    if (!deferred) return;
    const event = deferred; deferred = null; button.hidden = true;
    try { await event.prompt(); if ((await event.userChoice).outcome === "accepted") dialog.close(); } catch { instruction.hidden = false; }
  };
  const later = document.createElement("button"); later.textContent = "Lanjut ke aplikasi";
  later.className = "ghost";
  later.onclick = () => dialog.close();
  dialog.append(heading, text, instruction, button, later); document.body.append(dialog); dialog.showModal();
}
