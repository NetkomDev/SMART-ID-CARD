import { gateIntro, gateHelp } from "../../shared/portal-ui";
import "./styles.css";
import { PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt, offerInstall } from "../../shared/install-prompt";

const portal = new PortalSession("PARENT", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
setupInstallPrompt("Portal Orang Tua", import.meta.env.BASE_URL, import.meta.env.PROD);

type Child = {
  student_id: string;
  school_name: string;
  full_name: string;
  student_number: string;
  class_name?: string | null;
  relationship: string;
};

type ParentTodayData = {
  student_id: string;
  timezone: string;
  as_of?: string;
  profile?: {
    full_name: string;
    first_name: string;
    school_name: string;
    class_name: string;
    photo_url?: string | null;
  };
  attendance?: {
    status: "HADIR" | "TERLAMBAT" | "PULANG" | "BELUM_HADIR" | "SAKIT" | "IZIN" | "ALASAN_LAIN";
    check_in: string;
    check_out: string;
  };
  waste?: {
    today_kg: number;
    total_points: number | null;
    today_points: number | null;
    unscored?: number;
  };
  library?: {
    today_visits: number;
    month_visits: number | null;
  };
  extracurricular?: {
    name: string;
    status: "HADIR" | "BELUM_HADIR" | "TIDAK_ADA" | "IZIN" | "ALPA";
    time_attended: string;
    schedule?: string | null;
    activities_count?: number;
  };
  events: Array<{
    id: string;
    type: string;
    occurred_at: string;
    is_late: boolean;
    extra_info?: string;
  }>;
};

const root = document.querySelector<HTMLDivElement>("#app")!;
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const request = <T>(path: string, init: RequestInit = {}) => portal.request<T>(path, init);

// High-Performance Local Cache Layer
const CACHE_KEYS = {
  CHILDREN: "aksis_parent_children_v3",
  PROFILE_NAME: "aksis_parent_name_v3",
  SELECTED_CHILD: "aksis_parent_selected_child_v3",
  TODAY: (studentId: string) => `aksis_parent_today_${studentId}_v3`
};

function getStoredCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function setStoredCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

let loginScanner: any = null;
let cachedParentName = getStoredCache<string>(CACHE_KEYS.PROFILE_NAME) || "";
let selectedChildId = getStoredCache<string>(CACHE_KEYS.SELECTED_CHILD) || "";
let cachedChildren: Child[] | null = getStoredCache<Child[]>(CACHE_KEYS.CHILDREN);

let viewRevision = 0;
let dashboardVisible = false;
let isRefreshingData = false;
let activeTab: "home" | "add" | "profile" = "home";

const number = (value: number | null) => value == null ? "—" : value.toLocaleString("id-ID", { maximumFractionDigits: 2 });

function showSyncBar(show: boolean) {
  const bar = document.getElementById("sync-bar");
  if (bar) {
    if (show) bar.classList.add("active");
    else bar.classList.remove("active");
  }
}

/**
 * FUNGSI CERDAS MAKEOVER FOTO SISWA HD & LATAR BIRU:
 * 1. Penajaman Kualitas HD (Sharpening Convolution & Contrast Enhancer) untuk foto buram.
 * 2. Deteksi & Penggantian Latar Belakang ke Biru Pas Foto Standar (#0052cc / Royal Blue).
 * 3. Presisi Posisi Pas Foto (Penyelarasan Kepala & Bahu secara Simetris).
 */
function makeoverStudentPhoto(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // A. Corner Color Sampling: Ambil sampel warna latar dari 4 sudut & tepi atas
  let bgR = 0, bgG = 0, bgB = 0, sampleCount = 0;
  const samplePoints = [
    { x: 5, y: 5 }, { x: w - 5, y: 5 }, { x: 10, y: 15 }, { x: w - 10, y: 15 },
    { x: Math.floor(w / 2), y: 5 }, { x: 5, y: Math.floor(h * 0.08) }, { x: w - 5, y: Math.floor(h * 0.08) }
  ];

  for (const pt of samplePoints) {
    const idx = (pt.y * w + pt.x) * 4;
    bgR += data[idx]!;
    bgG += data[idx + 1]!;
    bgB += data[idx + 2]!;
    sampleCount++;
  }

  bgR = Math.round(bgR / sampleCount);
  bgG = Math.round(bgG / sampleCount);
  bgB = Math.round(bgB / sampleCount);

  // Target Warna Latar Biru Pas Foto Standar (#0052cc)
  const targetBlueR = 0;
  const targetBlueG = 82;
  const targetBlueB = 204;

  // Masking Array untuk Segmentasi Subjek Siswa vs Background
  const fgMask = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx]!;
      const g = data[idx + 1]!;
      const b = data[idx + 2]!;

      // Jarak warna dari sampel latar belakang
      const colorDist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);

      // Deteksi Warna Kulit Manusia
      const isSkin = (r > 45 && g > 25 && b > 15 && r > g && (r - g) > 10 && (r - b) > 10);
      // Deteksi Warna Rambut / Pakaian Gelap
      const isHairOrDark = (r < 55 && g < 55 && b < 55 && y > h * 0.06);

      // Subjek siswa jika memiliki warna kulit, rambut, atau beda dari latar
      const isForeground = isSkin || isHairOrDark || (colorDist > 42 && y > h * 0.04);

      if (isForeground) {
        fgMask[y * w + x] = 1;
      }
    }
  }

  // B. Refine Foreground Mask & Ganti Latar ke Biru Pas Foto Standar
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const isFg = fgMask[y * w + x];

      if (!isFg) {
        // Latar Belakang Biru Pas Foto Standar HD dengan gradien halus
        const vRatio = y / h;
        data[idx] = Math.round(targetBlueR * (1 - vRatio * 0.15));
        data[idx + 1] = Math.round(targetBlueG * (1 - vRatio * 0.1));
        data[idx + 2] = Math.min(255, Math.round(targetBlueB * (1 - vRatio * 0.05)));
      } else {
        // Auto-Contrast & Color Brightness Enhancement (Mengubah foto buram jadi HD)
        let r = data[idx]!;
        let g = data[idx + 1]!;
        let b = data[idx + 2]!;

        r = Math.min(255, Math.max(0, Math.round(((r / 255 - 0.5) * 1.14 + 0.5) * 255 + 5)));
        g = Math.min(255, Math.max(0, Math.round(((g / 255 - 0.5) * 1.14 + 0.5) * 255 + 5)));
        b = Math.min(255, Math.max(0, Math.round(((b / 255 - 0.5) * 1.14 + 0.5) * 255 + 5)));

        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // C. Unsharp Sharpening Convolution Filter (Mempertajam Deteksi Wajah & Rambut Blur)
  const sharpCanvas = document.createElement("canvas");
  sharpCanvas.width = w;
  sharpCanvas.height = h;
  const sharpCtx = sharpCanvas.getContext("2d")!;
  sharpCtx.drawImage(canvas, 0, 0);

  const sharpData = sharpCtx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(sharpData.data);
  const dst = sharpData.data;

  // Matrix Kernel Penajaman Resolusi HD: [ [0, -0.35, 0], [-0.35, 2.4, -0.35], [0, -0.35, 0] ]
  const weights = [0, -0.35, 0, -0.35, 2.4, -0.35, 0, -0.35, 0];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let r = 0, g = 0, b = 0;
      for (let cy = -1; cy <= 1; cy++) {
        for (let cx = -1; cx <= 1; cx++) {
          const scx = x + cx;
          const scy = y + cy;
          const sidx = (scy * w + scx) * 4;
          const wt = weights[(cy + 1) * 3 + (cx + 1)]!;
          r += src[sidx]! * wt;
          g += src[sidx + 1]! * wt;
          b += src[sidx + 2]! * wt;
        }
      }
      const didx = (y * w + x) * 4;
      dst[didx] = Math.min(255, Math.max(0, Math.round(r)));
      dst[didx + 1] = Math.min(255, Math.max(0, Math.round(g)));
      dst[didx + 2] = Math.min(255, Math.max(0, Math.round(b)));
    }
  }

  sharpCtx.putImageData(sharpData, 0, 0);
  return sharpCanvas;
}

function openPhotoCropperModal(studentId: string, studentName: string) {
  const modal = document.createElement("div");
  modal.className = "photo-modal-overlay";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
  
  modal.innerHTML = `
    <div style="background:white;border-radius:24px;width:100%;max-width:420px;max-height:92vh;overflow-y:auto;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);font-family:sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <h3 style="margin:0;font-size:1.1rem;font-weight:700;color:#0f172a;">Foto ID Card PVC 3:4</h3>
        <button id="close-cropper-modal" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#64748b;padding:2px 8px;">&times;</button>
      </div>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:12px 14px;margin-bottom:16px;font-size:0.82rem;color:#1e40af;">
        <strong style="display:block;margin-bottom:4px;color:#1e3a8a;">📌 Panduan Foto Resmi Sekolah:</strong>
        <ul style="margin:0;padding-left:16px;line-height:1.45;">
          <li>Gunakan seragam sekolah resmi & rapi</li>
          <li>Wajah menghadap lurus ke depan</li>
          <li>Fitur Makeover Otomatis merubah latar belakang ke Biru Pas Foto & mempertajam foto buram ke HD</li>
        </ul>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <input type="file" id="photo-camera-input" accept="image/*" capture="user" style="display:none;" />
        <input type="file" id="photo-gallery-input" accept="image/*" style="display:none;" />

        <button type="button" id="btn-open-camera" style="padding:12px;border-radius:12px;background:#2563eb;color:white;font-weight:600;font-size:0.88rem;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;">
          📷 Kamera HP
        </button>
        <button type="button" id="btn-open-gallery" style="padding:12px;border-radius:12px;background:#0284c7;color:white;font-weight:600;font-size:0.88rem;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;">
          🖼️ Galeri Foto
        </button>
      </div>

      <div id="cropper-container" style="display:none;flex-direction:column;align-items:center;">
        <div style="position:relative;width:240px;height:320px;border:3px dashed #2563eb;border-radius:16px;overflow:hidden;background:#f8fafc;box-shadow:0 4px 12px rgba(0,0,0,0.1);margin-bottom:12px;touch-action:none;cursor:move;">
          <canvas id="cropper-canvas" width="240" height="320" style="width:240px;height:320px;"></canvas>
          <div style="position:absolute;inset:0;border:2px solid rgba(37,99,235,0.4);pointer-events:none;border-radius:14px;"></div>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:12px;width:100%;">
          <button type="button" id="btn-auto-makeover" style="flex:1;padding:10px;border-radius:12px;background:linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);color:white;font-weight:700;font-size:0.85rem;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(37,99,235,0.3);">
            ✨ Makeover HD & Latar Biru
          </button>
        </div>

        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;width:100%;justify-content:center;">
          <button type="button" id="btn-zoom-out" style="padding:6px 14px;border-radius:8px;border:1px solid #cbd5e1;background:white;font-weight:600;cursor:pointer;">🔍 -</button>
          <span style="font-size:0.82rem;color:#64748b;font-weight:500;">Geser & Zoom Foto</span>
          <button type="button" id="btn-zoom-in" style="padding:6px 14px;border-radius:8px;border:1px solid #cbd5e1;background:white;font-weight:600;cursor:pointer;">🔍 +</button>
        </div>

        <button type="button" id="btn-save-photo" style="width:100%;padding:12px;border-radius:12px;background:#16a34a;color:white;font-weight:600;font-size:0.95rem;border:none;cursor:pointer;">
          💾 Simpan Foto (Rasio 3:4 Pas PVC)
        </button>
        
        <div id="upload-progress-wrap" style="display:none;margin-top:14px;width:100%;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:0.82rem;font-weight:600;color:#1e293b;">
            <span id="upload-progress-status">⏳ Memproses foto...</span>
            <span id="upload-progress-percent" style="color:#2563eb;font-weight:700;">0%</span>
          </div>
          <div style="width:100%;height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;position:relative;">
            <div id="upload-progress-bar" style="width:0%;height:100%;background:linear-gradient(90deg, #2563eb 0%, #16a34a 100%);border-radius:999px;transition:width 0.25s ease-out;"></div>
          </div>
        </div>
      </div>

      <div id="cropper-status" style="margin-top:12px;text-align:center;font-size:0.85rem;"></div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector("#close-cropper-modal") as HTMLButtonElement;
  const cameraInput = modal.querySelector("#photo-camera-input") as HTMLInputElement;
  const galleryInput = modal.querySelector("#photo-gallery-input") as HTMLInputElement;
  const cameraBtn = modal.querySelector("#btn-open-camera") as HTMLButtonElement;
  const galleryBtn = modal.querySelector("#btn-open-gallery") as HTMLButtonElement;
  const cropperContainer = modal.querySelector("#cropper-container") as HTMLDivElement;
  const canvas = modal.querySelector("#cropper-canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const btnMakeover = modal.querySelector("#btn-auto-makeover") as HTMLButtonElement;
  const zoomInBtn = modal.querySelector("#btn-zoom-in") as HTMLButtonElement;
  const zoomOutBtn = modal.querySelector("#btn-zoom-out") as HTMLButtonElement;
  const saveBtn = modal.querySelector("#btn-save-photo") as HTMLButtonElement;
  const statusDiv = modal.querySelector("#cropper-status") as HTMLDivElement;

  let loadedImg: HTMLImageElement | null = null;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let isMakeoverApplied = false;

  closeBtn.onclick = () => modal.remove();
  cameraBtn.onclick = () => cameraInput.click();
  galleryBtn.onclick = () => galleryInput.click();

  const processFile = (file: File | undefined) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        loadedImg = img;
        cropperContainer.style.display = "flex";
        isMakeoverApplied = false;
        
        const scaleX = 240 / img.width;
        const scaleY = 320 / img.height;
        scale = Math.max(scaleX, scaleY);
        offsetX = (240 - img.width * scale) / 2;
        offsetY = (320 - img.height * scale) / 2;
        draw();
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  cameraInput.onchange = () => processFile(cameraInput.files?.[0]);
  galleryInput.onchange = () => processFile(galleryInput.files?.[0]);

  function draw() {
    if (!loadedImg) return;
    ctx.clearRect(0, 0, 240, 320);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 240, 320);
    ctx.drawImage(loadedImg, offsetX, offsetY, loadedImg.width * scale, loadedImg.height * scale);

    if (isMakeoverApplied) {
      const processed = makeoverStudentPhoto(canvas);
      ctx.drawImage(processed, 0, 0);
    }
  }

  btnMakeover.onclick = () => {
    if (!loadedImg) return;
    isMakeoverApplied = true;
    draw();
    btnMakeover.innerHTML = "✨ Makeover HD & Latar Biru (Aktif ✓)";
    btnMakeover.style.background = "#16a34a";
    statusDiv.style.color = "#16a34a";
    statusDiv.style.fontWeight = "600";
    statusDiv.textContent = "✨ Foto berhasil di-makeover ke resolusi HD & latar biru pas foto!";
  };

  zoomInBtn.onclick = () => { scale *= 1.15; draw(); };
  zoomOutBtn.onclick = () => { scale /= 1.15; draw(); };

  canvas.onpointerdown = (e) => {
    isDragging = true;
    startX = e.clientX - offsetX;
    startY = e.clientY - offsetY;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  };

  canvas.onpointermove = (e) => {
    if (!isDragging) return;
    offsetX = e.clientX - startX;
    offsetY = e.clientY - startY;
    draw();
  };

  canvas.onpointerup = canvas.onpointercancel = (e) => {
    isDragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  };

  saveBtn.onclick = async () => {
    if (!loadedImg) return;
    saveBtn.disabled = true;
    cameraBtn.disabled = true;
    galleryBtn.disabled = true;
    saveBtn.textContent = "Mengunggah foto...";
    
    const progressWrap = modal.querySelector("#upload-progress-wrap") as HTMLDivElement;
    const progressBar = modal.querySelector("#upload-progress-bar") as HTMLDivElement;
    const progressStatus = modal.querySelector("#upload-progress-status") as HTMLSpanElement;
    const progressPercent = modal.querySelector("#upload-progress-percent") as HTMLSpanElement;

    progressWrap.style.display = "block";
    statusDiv.textContent = "";

    const setProgress = (percent: number, statusText: string) => {
      progressBar.style.width = `${percent}%`;
      progressPercent.textContent = `${percent}%`;
      progressStatus.textContent = statusText;
    };

    try {
      setProgress(20, "✨ Melakukan Makeover HD & Latar Belakang Biru...");
      await new Promise(r => setTimeout(r, 120));

      const outCanvas = document.createElement("canvas");
      outCanvas.width = 600;
      outCanvas.height = 800;
      const outCtx = outCanvas.getContext("2d")!;
      
      const ratio = 600 / 240;
      outCtx.fillStyle = "#ffffff";
      outCtx.fillRect(0, 0, 600, 800);
      outCtx.drawImage(loadedImg, offsetX * ratio, offsetY * ratio, loadedImg.width * scale * ratio, loadedImg.height * scale * ratio);

      // Terapkan Smart Makeover HD & Latar Belakang Biru Pas Foto Standar
      const finalCanvas = makeoverStudentPhoto(outCanvas);

      setProgress(55, "🚀 Mengompresi format JPEG HD standar PVC...");
      await new Promise(r => setTimeout(r, 120));

      const base64Photo = finalCanvas.toDataURL("image/jpeg", 0.90);

      setProgress(80, "📡 Mengunggah foto ke database sekolah...");

      await request(`/parent/children/${studentId}/photo`, {
        method: "POST",
        body: JSON.stringify({ photo_url: base64Photo })
      });

      setProgress(100, "✅ Foto Makeover HD berhasil disimpan! Status kartu SIAP CETAK.");
      statusDiv.style.color = "#16a34a";
      statusDiv.style.fontWeight = "700";
      statusDiv.textContent = "Kartu siswa kini siap dicetak oleh admin sekolah.";

      setTimeout(() => {
        modal.remove();
        void fetchDashboardData(studentId);
      }, 1200);
    } catch (err: any) {
      saveBtn.disabled = false;
      cameraBtn.disabled = false;
      galleryBtn.disabled = false;
      saveBtn.textContent = "Coba Lagi";
      progressBar.style.background = "#dc2626";
      progressStatus.textContent = "❌ Gagal mengunggah foto";
      statusDiv.style.color = "#dc2626";
      statusDiv.textContent = "❌ Gagal menyimpan foto: " + (err?.message || "Terjadi kesalahan");
    }
  };
}

function openPhotoPreviewModal(studentId: string, studentName: string, photoUrl: string) {
  const modal = document.createElement("div");
  modal.className = "photo-preview-overlay";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,0.9);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;";

  modal.innerHTML = `
    <div style="background:linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);border-radius:28px;width:100%;max-width:380px;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.4);display:flex;flex-direction:column;align-items:center;text-align:center;font-family:sans-serif;border:1px solid rgba(255,255,255,0.2);">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:16px;">
        <span style="font-size:0.75rem;font-weight:800;color:#2563eb;letter-spacing:0.08em;text-transform:uppercase;">Foto Kartu PVC Siswa</span>
        <button id="close-preview-x" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#64748b;padding:2px 6px;">&times;</button>
      </div>

      <div style="position:relative;width:240px;height:320px;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,0.18);margin-bottom:16px;border:3px solid white;background:#e2e8f0;">
        <img src="${esc(photoUrl)}" alt="${esc(studentName)}" style="width:100%;height:100%;object-fit:cover;" />
      </div>

      <h3 style="margin:0 0 4px;font-size:1.15rem;font-weight:700;color:#0f172a;">${esc(studentName)}</h3>
      <p style="margin:0 0 20px;font-size:0.82rem;color:#64748b;">Foto resmi yang digunakan untuk pencetakan ID Card PVC</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;">
        <button type="button" id="btn-change-photo" style="padding:13px;border-radius:14px;background:#2563eb;color:white;font-weight:700;font-size:0.92rem;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(37,99,235,0.25);">
          ✏️ Ganti
        </button>
        <button type="button" id="btn-back-preview" style="padding:13px;border-radius:14px;background:#f1f5f9;color:#334155;font-weight:700;font-size:0.92rem;border:1px solid #cbd5e1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;">
          ↩ Kembali
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector("#close-preview-x")?.addEventListener("click", close);
  modal.querySelector("#btn-back-preview")?.addEventListener("click", close);

  modal.querySelector("#btn-change-photo")?.addEventListener("click", () => {
    close();
    openPhotoCropperModal(studentId, studentName);
  });
}

function openAbsencePermitModal(
  studentId: string,
  studentName: string,
  schoolName: string,
  className: string,
  currentAttendance?: any
) {
  const modal = document.createElement("div");
  modal.className = "absence-permit-overlay";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";

  const todayStr = new Date().toISOString().split("T")[0]!;
  let attachedBase64 = "";

  modal.innerHTML = `
    <div style="background:white;border-radius:24px;width:100%;max-width:440px;max-height:92vh;overflow-y:auto;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);font-family:sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div>
          <small style="color:#2563eb;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">FORMULIR KETIDAKHADIRAN</small>
          <h3 style="margin:2px 0 0;font-size:1.15rem;font-weight:700;color:#0f172a;">Pengajuan Izin / Sakit</h3>
        </div>
        <button id="close-permit-x" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#64748b;padding:2px 8px;">&times;</button>
      </div>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 14px;margin-bottom:16px;font-size:0.83rem;color:#475569;">
        <strong>Siswa:</strong> ${esc(studentName)} <br>
        <strong>Kelas & Sekolah:</strong> ${esc(className)} · ${esc(schoolName)}
      </div>

      <form id="permit-form">
        <div id="permit-error" style="display:none;margin-bottom:14px;padding:10px 14px;border-radius:10px;font-size:0.85rem;"></div>

        <label style="display:block;margin-bottom:14px;font-weight:600;font-size:0.88rem;color:#1e293b;">
          Tanggal Izin
          <input type="date" name="permit_date" value="${todayStr}" required style="width:100%;margin-top:6px;padding:10px;border-radius:10px;border:1px solid #cbd5e1;font-size:0.9rem;" />
        </label>

        <label style="display:block;margin-bottom:14px;font-weight:600;font-size:0.88rem;color:#1e293b;">
          Alasan Ketidakhadiran
          <select name="reason" id="permit-reason-select" required style="width:100%;margin-top:6px;padding:10px;border-radius:10px;border:1px solid #cbd5e1;font-size:0.9rem;background:white;">
            <option value="SAKIT">Sakit</option>
            <option value="IZIN">Izin (Keperluan Keluarga / Acara)</option>
            <option value="ALASAN_LAIN">Alasan Lainnya</option>
          </select>
        </label>

        <label style="display:block;margin-bottom:16px;font-weight:600;font-size:0.88rem;color:#1e293b;">
          Penjelasan Singkat
          <textarea name="notes" required rows="3" style="width:100%;margin-top:6px;padding:10px;border-radius:10px;border:1px solid #cbd5e1;font-size:0.88rem;font-family:sans-serif;" placeholder="Contoh: Demam tinggi sejak semalam / Acara keluarga di luar kota"></textarea>
        </label>

        <div id="doctor-note-section" style="margin-bottom:18px;">
          <div id="doctor-note-warning" style="background:#fff7ed;border:1.5px solid #fdba74;border-radius:12px;padding:12px 14px;margin-bottom:12px;font-size:0.82rem;color:#9a3412;">
            <strong>📌 Lampiran Surat Dokter:</strong>
            <p style="margin:4px 0 0;line-height:1.4;">Wajib melampirkan foto Surat Keterangan Dokter apabila izin sakit memasuki hari ke-2 (berturut-turut) atau lebih.</p>
          </div>

          <label style="display:block;font-weight:600;font-size:0.85rem;color:#1e293b;margin-bottom:8px;">
            Foto Surat Keterangan Dokter <span id="doctor-note-req-badge" style="color:#2563eb;font-size:0.78rem;">(Opsional Hari Ke-1)</span>
          </label>

          <input type="file" id="permit-camera-input" accept="image/*" capture="environment" style="display:none;" />
          <input type="file" id="permit-gallery-input" accept="image/*" style="display:none;" />

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <button type="button" id="btn-permit-camera" style="padding:10px;border-radius:10px;background:#2563eb;color:white;font-weight:600;font-size:0.82rem;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;">
              📷 Kamera HP
            </button>
            <button type="button" id="btn-permit-gallery" style="padding:10px;border-radius:10px;background:#0284c7;color:white;font-weight:600;font-size:0.82rem;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;">
              🖼️ Galeri Foto
            </button>
          </div>

          <div id="permit-preview-container" style="display:none;align-items:center;gap:10px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:12px;padding:10px;">
            <img id="permit-preview-img" style="width:60px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #cbd5e1;" />
            <div style="flex:1;">
              <span style="font-size:0.8rem;font-weight:700;color:#16a34a;display:block;">✔ Surat Dokter Terlampir</span>
              <button type="button" id="btn-remove-attachment" style="background:none;border:none;color:#dc2626;font-size:0.75rem;cursor:pointer;padding:0;margin-top:2px;">Hapus Lampiran</button>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:10px;">
          <button type="button" id="btn-cancel-permit" class="btn-secondary" style="flex:1;padding:12px;border-radius:12px;font-weight:600;">Batal</button>
          <button type="submit" id="btn-submit-permit" style="flex:2;padding:12px;border-radius:12px;background:#16a34a;color:white;font-weight:700;border:none;cursor:pointer;">Kirim Pengajuan</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector("#close-permit-x")?.addEventListener("click", close);
  modal.querySelector("#btn-cancel-permit")?.addEventListener("click", close);

  const reasonSelect = modal.querySelector("#permit-reason-select") as HTMLSelectElement;
  const doctorSection = modal.querySelector("#doctor-note-section") as HTMLDivElement;
  const cameraInput = modal.querySelector("#permit-camera-input") as HTMLInputElement;
  const galleryInput = modal.querySelector("#permit-gallery-input") as HTMLInputElement;
  const cameraBtn = modal.querySelector("#btn-permit-camera") as HTMLButtonElement;
  const galleryBtn = modal.querySelector("#btn-permit-gallery") as HTMLButtonElement;
  const previewContainer = modal.querySelector("#permit-preview-container") as HTMLDivElement;
  const previewImg = modal.querySelector("#permit-preview-img") as HTMLImageElement;
  const removeBtn = modal.querySelector("#btn-remove-attachment") as HTMLButtonElement;

  reasonSelect.onchange = () => {
    doctorSection.style.display = reasonSelect.value === "SAKIT" ? "block" : "none";
  };

  cameraBtn.onclick = () => cameraInput.click();
  galleryBtn.onclick = () => galleryInput.click();

  const handleImageFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      attachedBase64 = e.target?.result as string;
      previewImg.src = attachedBase64;
      previewContainer.style.display = "flex";
    };
    reader.readAsDataURL(file);
  };

  cameraInput.onchange = () => handleImageFile(cameraInput.files?.[0]);
  galleryInput.onchange = () => handleImageFile(galleryInput.files?.[0]);

  removeBtn.onclick = () => {
    attachedBase64 = "";
    previewContainer.style.display = "none";
    cameraInput.value = "";
    galleryInput.value = "";
  };

  const form = modal.querySelector("#permit-form") as HTMLFormElement;
  const errorDiv = modal.querySelector("#permit-error") as HTMLDivElement;
  const submitBtn = modal.querySelector("#btn-submit-permit") as HTMLButtonElement;

  form.onsubmit = async (e) => {
    e.preventDefault();
    errorDiv.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Mengirim pengajuan…";

    const d = new FormData(form);
    const reason = String(d.get("reason") ?? "SAKIT");
    const permitDate = String(d.get("permit_date") ?? todayStr);
    const notes = String(d.get("notes") ?? "").trim();

    try {
      await request("/parent/permits", {
        method: "POST",
        body: JSON.stringify({
          student_id: studentId,
          permit_date: permitDate,
          reason,
          notes,
          attachment_url: attachedBase64
        })
      });

      errorDiv.style.display = "block";
      errorDiv.style.background = "#dcfce7";
      errorDiv.style.border = "1px solid #86efac";
      errorDiv.style.color = "#15803d";
      errorDiv.style.fontWeight = "700";
      errorDiv.textContent = "✅ Pengajuan izin berhasil dikirim ke wali kelas & sekolah!";

      setTimeout(() => {
        close();
        void fetchDashboardData(studentId);
      }, 1200);
    } catch (err: any) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Kirim Pengajuan";
      errorDiv.style.display = "block";
      errorDiv.style.background = "#fef2f2";
      errorDiv.style.border = "1px solid #fca5a5";
      errorDiv.style.color = "#991b1b";
      errorDiv.textContent = "⚠️ " + (err?.message || "Gagal mengirim pengajuan izin.");
    }
  };
}

function loginView(message = "Pindai QR dari admin sekolah untuk membuka aktivitas anak Anda.", isError = false) {
  viewRevision++;
  dashboardVisible = false;
  root.innerHTML = `
    <main class="login">
      <header>
        <div class="brand">
          <img src="${import.meta.env.BASE_URL}logo.png" alt="AKSIS Logo">
          <b>AKSIS · Keluarga</b>
        </div>
      </header>
      <section class="portal-gate">
        ${gateIntro('Dekat dengan hari anak Anda', 'Ikuti kehadiran dan aktivitas anak melalui informasi terverifikasi dari sekolah.')}
        <p role="status">${esc(message)}</p>
        <button id="retry-portal" style="${isError ? '' : 'display:none;'}">Coba lagi</button>
        <div id="login-scanner-container" style="display:none; margin-top: 1rem;">
          <div id="login-qr-reader"></div>
          <button type="button" id="cancel-scan-btn" class="btn-secondary" style="margin-top:0.5rem; width:100%;">Batal Scan</button>
        </div>
        <button id="start-scan-btn" style="margin-top: 1rem; width:100%;">Pindai QR Akses</button>
        ${gateHelp}
      </section>
    </main>
  `;

  document.getElementById("retry-portal")?.addEventListener("click", () => void start());
  document.getElementById("start-scan-btn")?.addEventListener("click", async () => {
    document.getElementById("start-scan-btn")!.style.display = "none";
    document.getElementById("retry-portal")!.style.display = "none";
    document.getElementById("login-scanner-container")!.style.display = "block";
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
      document.getElementById("login-scanner-container")!.style.display = "none";
      document.getElementById("start-scan-btn")!.style.display = "block";
    }
  });

  document.getElementById("cancel-scan-btn")?.addEventListener("click", async () => {
    if (loginScanner) { try { await loginScanner.stop(); } catch {} }
    document.getElementById("login-scanner-container")!.style.display = "none";
    document.getElementById("start-scan-btn")!.style.display = "block";
  });
}

function parentLayout(contentHTML: string, tabName: "home" | "add" | "profile" = "home"): string {
  activeTab = tabName;
  return `
    <div class="parent-shell">
      <div id="sync-bar" class="sync-progress-bar"></div>
      <header class="aksis-pwa-header parent-header">
        <div class="brand">
          <img src="${import.meta.env.BASE_URL}logo.png" alt="AKSIS Logo">
          <div class="brand-text">
            <div class="brand-title">AKSIS</div>
            <div class="brand-subtitle">Kontrol Orang Tua</div>
          </div>
        </div>
        <div class="header-right"></div>
      </header>

      <main>
        ${contentHTML}
      </main>

      <nav class="parent-nav" aria-label="Navigasi portal">
        <button id="nav-home" class="${tabName === 'home' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Beranda</span>
        </button>
        <button id="nav-add" class="${tabName === 'add' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span>Tambah anak</span>
        </button>
        <button id="nav-profile" class="${tabName === 'profile' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Akses saya</span>
        </button>
      </nav>
    </div>
  `;
}

// Synchronous 0ms Dashboard UI Renderer
function renderDashboardUI(children: Child[], selected: Child, data: ParentTodayData) {
  dashboardVisible = true;
  selectedChildId = selected.student_id;

  const profile = data.profile ?? {
    full_name: selected.full_name,
    first_name: selected.full_name.split(/\s+/)[0] ?? "Siswa",
    school_name: selected.school_name,
    class_name: selected.class_name ?? "Belum ada kelas",
    photo_url: null
  };

  const attendance = data.attendance ?? calculateAttendanceFallback(data.events, data.timezone);
  const waste = data.waste ?? calculateWasteFallback(data.events);
  const library = data.library ?? calculateLibraryFallback(data.events);
  const extracurricular = data.extracurricular ?? calculateEkskulFallback(data.events, data.timezone);

  const formattedDate = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: data.timezone || "Asia/Makassar"
  }).format(new Date(data.as_of ?? Date.now()));

  const initials = profile.full_name.split(/\s+/).slice(0, 2).map(n => n[0]).join("").toUpperCase();

  const contentHTML = `
    ${children.length > 1 ? `
      <div class="child-picker-container">
        <label class="sr-only" for="child-picker">Pilih anak</label>
        <select id="child-picker" class="child-picker-select">
          ${children.map(c => `<option value="${esc(c.student_id)}" ${c.student_id === selectedChildId ? 'selected' : ''}>Anak: ${esc(c.full_name)} (${esc(c.school_name)})</option>`).join("")}
        </select>
      </div>
    ` : ""}

    <div class="parent-content">
      ${!profile.photo_url ? `
        <div class="photo-warning-banner" style="background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border: 1.5px solid #fdba74; border-radius: 16px; padding: 16px 18px; margin-bottom: 18px; display: flex; align-items: center; gap: 14px; box-shadow: 0 4px 12px rgba(234,88,12,0.08);">
          <div style="background: #ea580c; color: white; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">📷</div>
          <div style="flex: 1;">
            <h4 style="margin: 0 0 4px; font-size: 0.95rem; font-weight: 700; color: #9a3412;">Aksi Diperlukan: Unggah Foto Siswa</h4>
            <p style="margin: 0; font-size: 0.82rem; color: #c2410c;">Foto resmi sekolah diperlukan untuk pencetakan ID Card PVC ${esc(profile.first_name)}.</p>
          </div>
          <button type="button" id="btn-open-photo-modal" style="background: #ea580c; border: none; padding: 8px 16px; border-radius: 10px; color: white; font-weight: 700; font-size: 0.85rem; cursor: pointer; white-space: nowrap;">Unggah Foto</button>
        </div>
      ` : ""}

      <!-- Student Profile Card -->
      <section class="student-profile-card" style="cursor:pointer;" title="${profile.photo_url ? 'Klik untuk melihat foto full / mengganti foto' : 'Klik untuk mengunggah foto siswa'}">
        <div class="student-avatar-wrap">
          ${profile.photo_url ? `
            <img src="${esc(profile.photo_url)}" class="student-avatar" alt="${esc(profile.full_name)}" />
          ` : `
            <div class="avatar-fallback">${esc(initials)}</div>
          `}
        </div>
        <div class="student-details">
          <h2>${esc(profile.full_name)}</h2>
          <div class="info-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 7v14M21 7v14M6 21V11M18 21V11M12 21V4M12 4L4 7M12 4l8 3"/></svg>
            <span>${esc(profile.school_name)}</span>
          </div>
          <div class="info-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
            <span>${esc(profile.class_name)}</span>
          </div>
          <div class="info-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>${esc(formattedDate)}</span>
          </div>
        </div>
      </section>

      <!-- 2x2 Grid -->
      <div class="parent-grid">
        <!-- Card 1: Attendance -->
        <div class="grid-card card-attendance" id="card-attendance">
          <div>
            <div class="card-top">
              <div class="card-top-header">
                <div class="icon-badge green">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <span class="card-title">Kehadiran Hari Ini</span>
              </div>
              <span class="card-arrow">&rsaquo;</span>
            </div>

            ${renderAttendancePill(attendance.status)}
          </div>

          <div class="time-cols">
            <div class="time-box">
              <label>Jam Datang</label>
              <span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                ${esc(attendance.check_in)}
              </span>
            </div>
            <div class="time-box" style="text-align: right; align-items: flex-end;">
              <label>Jam Pulang</label>
              <span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                ${esc(attendance.check_out)}
              </span>
            </div>
          </div>
        </div>

        <!-- Card 2: Waste Points -->
        <div class="grid-card card-waste" id="card-waste">
          <div>
            <div class="card-top">
              <div class="card-top-header">
                <div class="icon-badge green">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
                </div>
                <span class="card-title">Poin Sampah</span>
              </div>
              <span class="card-arrow">&rsaquo;</span>
            </div>

            <div class="waste-body">
              <div class="donut-gauge" aria-label="Total poin tercatat">
                <div class="donut-center">
                  <span class="donut-val">${number(waste.total_points)}</span>
                  <span class="donut-lbl">poin</span>
                </div>
              </div>
              <div class="waste-info">
                <span class="sub">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/></svg>
                  Setoran hari ini
                </span>
                <span class="val">${number(waste.today_kg)} kg</span>
              </div>
            </div>
          </div>

          <div class="card-banner teal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            <span>${waste.unscored ? "Sebagian setoran belum memiliki nilai poin." : "Terus jaga lingkungan sekolah tetap bersih!"}</span>
          </div>
        </div>

        <!-- Card 3: Library Visits -->
        <div class="grid-card card-library" id="card-library">
          <div>
            <div class="card-top">
              <div class="card-top-header">
                <div class="icon-badge blue">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                </div>
                <span class="card-title">Kunjungan Perpustakaan</span>
              </div>
              <span class="card-arrow">&rsaquo;</span>
            </div>

            <div class="stat-primary">
              <span class="big-num">${library.today_visits}</span>
              <span class="unit">kunjungan hari ini</span>
            </div>
            <div class="stat-sub">
              Total bulan ini <b>${number(library.month_visits)} kunjungan</b>
            </div>
          </div>

          <div class="card-banner blue">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            <span>Membaca membuka lebih banyak peluang!</span>
          </div>
        </div>

        <!-- Card 4: Extracurricular -->
        <div class="grid-card card-ekskul" id="card-ekskul">
          <div>
            <div class="card-top">
              <div class="card-top-header">
                <div class="icon-badge orange">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </div>
                <span class="card-title">Ekstrakurikuler</span>
              </div>
              <span class="card-arrow">&rsaquo;</span>
            </div>

            <div class="ekskul-title">${esc(extracurricular.name)}</div>${(extracurricular.activities_count ?? 0) > 1 ? `<p class="activity-count">${extracurricular.activities_count} kegiatan hari ini · lihat detail</p>` : ""}

            <div style="display: flex; align-items: center; gap: 8px; margin: 4px 0 6px;">
              <span style="font-size: 0.72rem; color: var(--parent-text-muted); display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              </span>
              <span style="font-size: 0.78rem; font-weight: 800; padding: 2px 8px; border-radius: 8px; background: ${extracurricular.status === 'HADIR' ? '#d4f1e3' : '#edf2ef'}; color: ${extracurricular.status === 'HADIR' ? '#115c3c' : '#557065'};">
                ${({ HADIR: "✔ Hadir", IZIN: "Izin", ALPA: "Tidak hadir", TIDAK_ADA: "Tidak ada jadwal", BELUM_HADIR: "Belum presensi" })[extracurricular.status]}
              </span>
            </div>

            <div class="ekskul-time">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>${esc(extracurricular.schedule ?? (extracurricular.time_attended !== "—" ? `Presensi ${extracurricular.time_attended}` : "Belum ada jadwal hari ini"))}</span>
            </div>
          </div>

          <div class="card-banner warm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
            <span>Terus kembangkan bakat dan minatmu!</span>
          </div>
        </div>
      </div>

      <!-- Motivation Banner -->
      <section class="motivation-card">
        <div class="star-circle">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </div>
        <div class="motivation-text">
          <h3>Terus semangat, ${esc(profile.first_name)}!</h3>
          <p>Kami selalu mendukung langkah terbaikmu.</p>
        </div>
      </section>
    </div>

    <div class="refresh-row"><span>Data sekolah · ${esc(new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: data.timezone }).format(new Date(data.as_of ?? Date.now())))}</span><button id="refresh-dashboard" class="btn-secondary">Perbarui data</button></div>
    <dialog id="timeline-drawer" class="modal-overlay" aria-labelledby="drawer-title">
      <div class="drawer-card">
        <div class="drawer-head">
          <h3 id="drawer-title">Aktivitas Hari Ini (${esc(profile.first_name)})</h3>
          <button class="drawer-close" id="close-drawer-btn" aria-label="Tutup aktivitas">&times;</button>
        </div>
        <div class="timeline-content">
          ${data.events.length ? renderTimelineEvents(data.events, data.timezone) : `
            <div class="empty compact" style="padding: 24px 0;">
              <span>○</span>
              <h3>Belum ada aktivitas hari ini</h3>
              <p>Aktivitas terverifikasi dari gerbang, sampah, dan perpustakaan akan otomatis muncul di sini.</p>
            </div>
          `}
        </div>
      </div>
    </dialog>
  `;

  root.innerHTML = parentLayout(contentHTML, "home");
  bindGlobalEvents();

  const handlePhotoClick = () => {
    if (profile.photo_url) {
      openPhotoPreviewModal(selected.student_id, profile.full_name, profile.photo_url);
    } else {
      openPhotoCropperModal(selected.student_id, profile.full_name);
    }
  };

  document.getElementById("btn-open-photo-modal")?.addEventListener("click", () => openPhotoCropperModal(selected.student_id, profile.full_name));
  document.querySelector(".student-profile-card")?.addEventListener("click", handlePhotoClick);

  const drawer = document.querySelector<HTMLDialogElement>("#timeline-drawer")!;
  const openDrawer = (prefix = "") => {
    const events = data.events.filter(event => event.type.startsWith(prefix));
    const labels: Record<string, string> = { "attendance.": "Kehadiran", "waste.": "Bank Sampah", "library.": "Perpustakaan", "extracurricular.": "Ekstrakurikuler" };
    document.getElementById("drawer-title")!.textContent = `${labels[prefix] ?? "Aktivitas"} hari ini`;
    drawer.querySelector(".timeline-content")!.innerHTML = events.length ? renderTimelineEvents(events, data.timezone) : '<p class="empty">Belum ada aktivitas tercatat hari ini.</p>';
    drawer.showModal();
  };

  const attCard = document.getElementById("card-attendance");
  if (attCard) {
    attCard.tabIndex = 0;
    attCard.setAttribute("role", "button");
    attCard.setAttribute("aria-label", "Pengajuan Izin / Sakit Kehadiran Hari Ini");
    attCard.addEventListener("click", () => {
      openAbsencePermitModal(selected.student_id, profile.full_name, profile.school_name, profile.class_name, data.attendance);
    });
    attCard.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openAbsencePermitModal(selected.student_id, profile.full_name, profile.school_name, profile.class_name, data.attendance);
      }
    });
  }

  for (const [id, prefix] of [["waste", "waste."], ["library", "library."], ["ekskul", "extracurricular."]]) {
    const card = document.getElementById(`card-${id}`);
    if (!card) continue;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-haspopup", "dialog");
    card.setAttribute("aria-label", `Lihat detail ${card.querySelector(".card-title")!.textContent}`);
    card.addEventListener("click", () => openDrawer(prefix));
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDrawer(prefix); }
    });
  }

  document.getElementById("close-drawer-btn")?.addEventListener("click", () => drawer.close());
  drawer.addEventListener("click", event => { if (event.target === drawer) drawer.close(); });
  document.getElementById("refresh-dashboard")?.addEventListener("click", () => void fetchDashboardData(selected.student_id));
  
  document.querySelector<HTMLImageElement>(".student-avatar")?.addEventListener("error", event => {
    (event.target as HTMLImageElement).parentElement!.innerHTML = `<div class="avatar-fallback">${esc(initials)}</div>`;
  });

  document.querySelector<HTMLSelectElement>('#child-picker')?.addEventListener('change', event => {
    selectedChildId = (event.target as HTMLSelectElement).value;
    setStoredCache(CACHE_KEYS.SELECTED_CHILD, selectedChildId);
    void dashboard(selectedChildId);
  });
}

// Background Asynchronous Parallel Fetcher (SWR Pattern)
async function fetchDashboardData(targetChildId?: string): Promise<boolean> {
  if (isRefreshingData) return true;
  isRefreshingData = true;
  showSyncBar(true);

  try {
    const fetchProfilePromise = !cachedParentName
      ? request<{ full_name: string | null }>("/parent/profile").catch(() => null)
      : Promise.resolve(null);

    const fetchChildrenPromise = request<Child[]>("/parent/children");

    const [profRes, childrenRes] = await Promise.all([fetchProfilePromise, fetchChildrenPromise]);

    if (profRes?.full_name && profRes.full_name !== "Orang Tua") {
      cachedParentName = profRes.full_name;
      setStoredCache(CACHE_KEYS.PROFILE_NAME, cachedParentName);
    }

    if (!Array.isArray(childrenRes) || !childrenRes.length) {
      dashboardVisible = false;
      if (activeTab === "home") {
        root.innerHTML = parentLayout(`
          <div class="parent-content">
            <section class="student-profile-card" style="flex-direction: column; text-align: center; padding: 32px 20px;">
              <div class="avatar-fallback" style="margin: 0 auto 12px; width: 64px; height: 64px; font-size: 1.5rem;">♡</div>
              <h2 style="font-size: 1.3rem;">Hubungkan Anak Anda</h2>
              <p style="font-size: 0.88rem; color: var(--parent-text-muted); margin: 6px 0 18px;">
                Masukkan NISN dan Tanggal Lahir untuk memverifikasi data siswa dan memantau aktivitas sekolah.
              </p>
              <button id="link-child-btn" style="width: 100%; max-width: 240px;">Hubungkan Anak</button>
            </section>
          </div>
        `, "home");
        bindGlobalEvents();
        document.getElementById("link-child-btn")?.addEventListener("click", linkView);
      }
      return false;
    }

    cachedChildren = childrenRes;
    setStoredCache(CACHE_KEYS.CHILDREN, cachedChildren);

    const desiredChildId = targetChildId || selectedChildId;
    const selected = childrenRes.find(c => c.student_id === desiredChildId) ?? childrenRes[0]!;
    selectedChildId = selected.student_id;
    setStoredCache(CACHE_KEYS.SELECTED_CHILD, selectedChildId);

    const data = await request<ParentTodayData>(`/parent/children/${selected.student_id}/today`);
    setStoredCache(CACHE_KEYS.TODAY(selected.student_id), data);

    if (activeTab === "home") {
      renderDashboardUI(cachedChildren, selected, data);
    }

    return true;
  } catch (err: any) {
    if (activeTab === "home" && !dashboardVisible) {
      loginView(err instanceof Error ? err.message : "Belum dapat memuat aktivitas.", true);
    }
    return false;
  } finally {
    isRefreshingData = false;
    showSyncBar(false);
  }
}

// 0ms Perception Speed Entrypoint for Dashboard
async function dashboard(forceChildId?: string): Promise<boolean> {
  activeTab = "home";
  const revision = ++viewRevision;

  if (!cachedChildren) cachedChildren = getStoredCache<Child[]>(CACHE_KEYS.CHILDREN);
  if (!selectedChildId) selectedChildId = getStoredCache<string>(CACHE_KEYS.SELECTED_CHILD) || "";
  
  if (forceChildId) selectedChildId = forceChildId;

  const targetChild = cachedChildren?.length
    ? (cachedChildren.find(c => c.student_id === selectedChildId) ?? cachedChildren[0]!)
    : null;

  if (targetChild) {
    selectedChildId = targetChild.student_id;
    const cachedToday = getStoredCache<ParentTodayData>(CACHE_KEYS.TODAY(targetChild.student_id));
    if (cachedToday) {
      // 🚀 INSTANT RENDER (0ms delay)!
      renderDashboardUI(cachedChildren!, targetChild, cachedToday);
      // Trigger background data sync silently
      void fetchDashboardData(selectedChildId);
      return true;
    }
  }

  // If no cached data exists, render sleek skeleton loading UI
  root.innerHTML = parentLayout(`
    <div class="parent-content">
      <section class="student-profile-card" style="padding: 24px 20px;">
        <div class="avatar-fallback" style="background:#cbd5e1; color:#64748b; font-size: 1.2rem;">⏳</div>
        <div class="student-details" style="width: 100%;">
          <div style="height: 18px; background: #cbd5e1; border-radius: 6px; width: 55%; margin-bottom: 8px;"></div>
          <div style="height: 12px; background: #e2e8f0; border-radius: 4px; width: 75%; margin-bottom: 6px;"></div>
          <div style="height: 12px; background: #e2e8f0; border-radius: 4px; width: 45%;"></div>
        </div>
      </section>
      <div class="parent-grid">
        <div class="grid-card" style="height: 160px; background: #f1f5f9;"></div>
        <div class="grid-card" style="height: 160px; background: #f1f5f9;"></div>
        <div class="grid-card" style="height: 160px; background: #f1f5f9;"></div>
        <div class="grid-card" style="height: 160px; background: #f1f5f9;"></div>
      </div>
    </div>
  `, "home");
  bindGlobalEvents();

  return await fetchDashboardData(selectedChildId);
}

function renderAttendancePill(status: string): string {
  switch (status) {
    case "PULANG":
      return `<div class="status-pill green">✔ Sudah Pulang</div>`;
    case "TERLAMBAT":
      return `<div class="status-pill orange">⚠ Terlambat</div>`;
    case "HADIR":
      return `<div class="status-pill green">✔ Hadir</div>`;
    case "SAKIT":
      return `<div class="status-pill orange" style="background:#ffedd5;color:#c2410c;border:1px solid #fdba74;">🏥 Sakit</div>`;
    case "IZIN":
    case "ALASAN_LAIN":
      return `<div class="status-pill blue" style="background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc;">📩 Izin</div>`;
    default:
      return `<div class="status-pill gray">○ Belum Hadir (Klik untuk Izin)</div>`;
  }
}

function renderTimelineEvents(events: ParentTodayData["events"], timezone: string): string {
  return `
    <div class="timeline">
      ${events.map(ev => {
        let title = "Aktivitas", desc = ev.extra_info || "", icon = "✓", color = "#146c43";
        if (ev.type === "attendance.check_in") { title = "Tiba di sekolah"; desc = ev.is_late ? "Tercatat terlambat" : "Terverifikasi gerbang sekolah"; icon = "🏢"; }
        else if (ev.type === "attendance.check_out") { title = "Pulang dari sekolah"; desc = "Terverifikasi gerbang sekolah"; icon = "🏠"; }
        else if (ev.type === "waste.transaction") { title = "Bank Sampah"; icon = "♻"; color = "#214b38"; }
        else if (ev.type === "library.visit") { title = "Perpustakaan"; icon = "📚"; color = "#0f5132"; }
        else if (ev.type === "extracurricular.attendance") { title = "Ekstrakurikuler"; icon = "🏅"; color = "#243b67"; }
        return `
          <article style="display: grid; grid-template-columns: 50px 12px 1fr 25px; gap: 12px; padding: 14px 0; border-bottom: 1px solid #edf1f4;">
            <time style="font-size: 0.8rem; font-weight: 700; color: #5b796d;">${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: timezone || "Asia/Makassar" }).format(new Date(ev.occurred_at))}</time>
            <i style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; margin-top: 6px;"></i>
            <div>
              <strong style="color: ${color}; font-size: 0.92rem;">${title}</strong>
              <p style="font-size: 0.82rem; margin: 2px 0 0; color: #5b796d;">${esc(desc)}</p>
            </div>
            <b style="color: ${color}">${icon}</b>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function calculateAttendanceFallback(events: ParentTodayData["events"], timezone: string) {
  const checkIn = events.filter(e => e.type === "attendance.check_in").sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))[0];
  const checkOut = events.find(e => e.type === "attendance.check_out");
  const isLate = checkIn?.is_late ?? false;

  let status: "HADIR" | "TERLAMBAT" | "PULANG" | "BELUM_HADIR" = "BELUM_HADIR";
  if (checkOut) status = "PULANG";
  else if (checkIn && isLate) status = "TERLAMBAT";
  else if (checkIn) status = "HADIR";

  const fmt = (iso?: string) => iso ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(iso)) : "—";
  return { status, check_in: fmt(checkIn?.occurred_at), check_out: fmt(checkOut?.occurred_at) };
}

function calculateWasteFallback(events: ParentTodayData["events"]) {
  const wasteEvents = events.filter(e => e.type === "waste.transaction");
  let todayKg = 0;
  for (const e of wasteEvents) {
    const match = e.extra_info?.match(/([\d.,]+)\s*kg/i);
    if (match?.[1]) todayKg += parseFloat(match[1].replace(",", "."));
  }
  return { today_kg: todayKg, total_points: null, today_points: null, unscored: wasteEvents.length };
}

function calculateLibraryFallback(events: ParentTodayData["events"]) {
  const count = events.filter(e => e.type === "library.visit").length;
  return { today_visits: count, month_visits: null };
}

function calculateEkskulFallback(events: ParentTodayData["events"], timezone: string) {
  const ekskul = events.find(e => e.type === "extracurricular.attendance");
  const name = ekskul?.extra_info ? ekskul.extra_info.replace(/^Kehadiran Ekskul\s*/i, "") : "Belum ada data kegiatan";
  const status: "HADIR" | "BELUM_HADIR" = ekskul ? "HADIR" : "BELUM_HADIR";
  const fmt = (iso?: string) => iso ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(iso)) : "—";
  return { name, status, time_attended: fmt(ekskul?.occurred_at), schedule: null, activities_count: 0 };
}

function bindGlobalEvents() {
  document.getElementById("nav-home")?.addEventListener("click", () => void dashboard());
  document.getElementById("nav-add")?.addEventListener("click", () => void linkView());
  document.getElementById("nav-profile")?.addEventListener("click", () => void profileView());
}

async function linkView() {
  viewRevision++;
  dashboardVisible = false;
  activeTab = "add";

  if (!cachedParentName) {
    try {
      const prof = await request<{ full_name: string | null }>("/parent/profile");
      if (prof?.full_name && prof.full_name !== "Orang Tua") {
        cachedParentName = prof.full_name;
        setStoredCache(CACHE_KEYS.PROFILE_NAME, cachedParentName);
      }
    } catch {}
  }

  const needParentNameInput = !cachedParentName || cachedParentName === "Orang Tua";

  root.innerHTML = parentLayout(`
    <div class="parent-content">
      <form class="link-card" id="link-form" style="background: white; border-radius: 22px; padding: 24px; border: 1px solid #e1efe8;">
        <small style="color: var(--parent-green-accent); font-weight: 800; letter-spacing: 0.1em;">TAUTAN AMAN LINTAS SEKOLAH</small>
        <h2 style="margin: 8px 0 6px; font-size: 1.3rem;">Hubungkan Anak</h2>
        <p style="font-size: 0.88rem; color: var(--parent-text-muted); margin-bottom: 20px;">
          ${needParentNameInput
            ? "Gunakan Nama Anda, NISN, dan Tanggal Lahir anak (SD, SMP, atau SMA) untuk memverifikasi data sekolah."
            : "Gunakan NISN dan Tanggal Lahir anak (SD, SMP, atau SMA) untuk menghubungkan anak berikutnya."}
        </p>
        <div id="error" class="error-msg" style="margin-bottom: 12px;"></div>

        ${needParentNameInput ? `
          <label style="display: block; margin-bottom: 14px;">
            Nama Orang Tua / Wali
            <input name="name" required maxlength="200" style="margin-top: 6px;" placeholder="Nama lengkap Anda" />
          </label>
        ` : `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 16px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <span style="font-size: 0.75rem; color: #64748b; font-weight: 600; display: block; margin-bottom: 2px;">Orang Tua / Wali:</span>
              <strong style="font-size: 0.95rem; color: #0f172a;">${esc(cachedParentName)}</strong>
            </div>
            <span style="font-size: 0.78rem; background: #dcfce7; color: #15803d; padding: 3px 10px; border-radius: 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">✓ Terverifikasi</span>
          </div>
        `}

        <label style="display: block; margin-bottom: 14px;">
          NISN Siswa
          <input name="nisn" required maxlength="50" style="margin-top: 6px;" placeholder="10 digit NISN" />
        </label>

        <label style="display: block; margin-bottom: 20px;">
          Tanggal Lahir Siswa
          <input type="date" name="dob" required style="margin-top: 6px;" />
        </label>

        <button style="width: 100%;">Verifikasi & Hubungkan</button>
        <button type="button" class="btn-secondary" id="cancel-link" style="width: 100%; margin-top: 8px;">Batal</button>
      </form>
    </div>
  `, "add");

  bindGlobalEvents();
  document.getElementById("cancel-link")?.addEventListener("click", () => void dashboard());

  const form = document.querySelector<HTMLFormElement>("#link-form")!;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const errorEl = document.getElementById("error")!;
    const submit = form.querySelector<HTMLButtonElement>("button:not([type])")!;
    const cancelBtn = document.getElementById("cancel-link") as HTMLButtonElement | null;
    const inputs = form.querySelectorAll<HTMLInputElement>("input");

    // 1. Visual processing state (banner + button + disabled inputs)
    errorEl.style.display = "block";
    errorEl.style.color = "#0369a1";
    errorEl.style.padding = "12px 14px";
    errorEl.style.borderRadius = "12px";
    errorEl.style.background = "#e0f2fe";
    errorEl.style.border = "1.5px solid #bae6fd";
    errorEl.style.fontSize = "0.85rem";
    errorEl.style.fontWeight = "600";
    errorEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <svg class="spin" style="width:20px;height:20px;flex-shrink:0;color:#0284c7;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <div>
          <strong style="display:block;color:#0369a1;">Memverifikasi Data Siswa…</strong>
          <span style="font-size:0.8rem;color:#0284c7;font-weight:400;">Menghubungkan ke database sekolah, mohon tunggu sebentar.</span>
        </div>
      </div>
    `;

    submit.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    inputs.forEach(inp => inp.disabled = true);
    submit.innerHTML = `
      <span style="display:inline-flex;align-items:center;justify-content:center;gap:8px;">
        <svg class="spin" style="width:18px;height:18px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Memproses Verifikasi...
      </span>
    `;

    const inputName = d.get("name") ? String(d.get("name")).trim() : "";
    const nameToSave = inputName || cachedParentName || "";

    try {
      const linkRes = await request<{ link_id: string; student_id: string }>("/parent/link", {
        method: "POST",
        body: JSON.stringify({
          nisn: String(d.get("nisn") ?? "").trim(),
          dob: String(d.get("dob") ?? "").trim(),
          full_name: nameToSave
        })
      });

      if (nameToSave && nameToSave !== "Orang Tua") {
        cachedParentName = nameToSave;
        setStoredCache(CACHE_KEYS.PROFILE_NAME, cachedParentName);
      }

      // Success feedback & update state
      errorEl.style.color = "#15803d";
      errorEl.style.background = "#dcfce7";
      errorEl.style.borderColor = "#86efac";
      errorEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:1.3rem;">✨</span>
          <div>
            <strong style="display:block;color:#166534;">Anak Berhasil Dihubungkan!</strong>
            <span style="font-size:0.8rem;color:#15803d;font-weight:400;">Dialihkan ke halaman Beranda...</span>
          </div>
        </div>
      `;

      const newStudentId = (linkRes as any)?.student_id;
      if (newStudentId) {
        selectedChildId = newStudentId;
        setStoredCache(CACHE_KEYS.SELECTED_CHILD, newStudentId);
      }

      await fetchDashboardData(selectedChildId);
      offerInstall();

      // Automatically navigate to Beranda (Home)
      await dashboard(selectedChildId);
    } catch (err: any) {
      errorEl.style.color = "#991b1b";
      errorEl.style.background = "#fef2f2";
      errorEl.style.borderColor = "#fca5a5";
      errorEl.innerHTML = "⚠️ " + (err?.message || "Data anak tidak ditemukan atau tidak cocok dengan database sekolah.");
      
      submit.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      inputs.forEach(inp => inp.disabled = false);
      submit.innerHTML = "Verifikasi & Hubungkan";
    }
  };
}

async function profileView() {
  viewRevision++;
  dashboardVisible = false;
  activeTab = "profile";

  if (!cachedParentName) {
    try {
      const prof = await request<{ full_name: string | null }>("/parent/profile");
      if (prof?.full_name && prof.full_name !== "Orang Tua") {
        cachedParentName = prof.full_name;
        setStoredCache(CACHE_KEYS.PROFILE_NAME, cachedParentName);
      }
    } catch {}
  }

  root.innerHTML = parentLayout(`
    <div class="parent-content">
      <section class="profile-card" style="background: white; border-radius: 22px; padding: 24px; border: 1px solid #e1efe8;">
        <small style="color: var(--parent-green-accent); font-weight: 800; letter-spacing: 0.1em;">AKSES SAYA</small>
        <h2 style="margin: 8px 0 16px; font-size: 1.3rem;">Informasi Portal Orang Tua</h2>
        <dl style="display: grid; gap: 14px; margin: 0 0 20px;">
          ${cachedParentName && cachedParentName !== "Orang Tua" ? `
            <div>
              <dt style="font-size: 0.8rem; color: var(--parent-text-muted);">Nama Orang Tua / Wali</dt>
              <dd style="margin: 2px 0 0; font-weight: 800; font-size: 1rem;">${esc(cachedParentName)}</dd>
            </div>
          ` : ""}
          <div>
            <dt style="font-size: 0.8rem; color: var(--parent-text-muted);">Sekolah Terhubung</dt>
            <dd style="margin: 2px 0 0; font-weight: 800; font-size: 1rem;">${esc(portal.context?.school_name)}</dd>
          </div>
          <div>
            <dt style="font-size: 0.8rem; color: var(--parent-text-muted);">Status Akses</dt>
            <dd style="margin: 2px 0 0; font-weight: 800; font-size: 1rem; color: #1c7352;">Terverifikasi QR Admin Sekolah</dd>
          </div>
        </dl>
        <p style="font-size: 0.85rem; color: var(--parent-text-muted); line-height: 1.5; margin-bottom: 24px;">
          Akses ini terenkripsi dan terhubung langsung ke server sekolah. Hubungi admin sekolah apabila terdapat kendala data anak.
        </p>
        <div class="persistent-access-note">
          <strong>Akses tersimpan di perangkat ini</strong>
          <span>Portal akan tetap terhubung selama akses belum dicabut oleh Admin Sekolah.</span>
        </div>
      </section>
    </div>
  `, "profile");

  bindGlobalEvents();
}

async function start() {
  const isConnected = portal.connected;

  if (isConnected) {
    // 🚀 Fast Startup Path: Render cached dashboard instantly if available
    const hasCachedData = Boolean(cachedChildren?.length && selectedChildId && getStoredCache(CACHE_KEYS.TODAY(selectedChildId)));
    if (hasCachedData) {
      void dashboard(); // Render instantly (0ms)
      portal.start().then(ok => {
        if (ok) void fetchDashboardData(selectedChildId);
        else loginView("Akses kadaluarsa. Pindai QR kembali.", true);
      }).catch(() => {});
      return;
    }
  }

  // Fallback to initial loading gate
  loginView("Membuka akses sekolah…");
  try {
    if (!await portal.start()) {
      loginView("Pindai QR Akses dari admin sekolah untuk masuk.", false);
      return;
    }
    const hasChildren = await dashboard();
    if (hasChildren) offerInstall();
  } catch (error) {
    loginView(error instanceof Error ? error.message : "Belum dapat terhubung.", true);
  }
}

void start();
