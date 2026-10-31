import type { Html5Qrcode } from "html5-qrcode";
type Reader = Pick<Html5Qrcode, "start" | "stop">;
type Phase = "off" | "starting" | "active" | "error";
type Options = {
  readerId: string;
  toggleId?: string;
  stageId?: string;
  placeholderId?: string;
  statusId?: string;
  errorId?: string;
  zoomId?: string;
  once?: boolean;
  canRead?: () => boolean;
  onDecode: (value: string) => void | Promise<void>;
  onState?: (phase: Phase) => void;
  factory?: (id: string) => Promise<Reader>;
};
export function scanBox(width: number, height: number) {
  const side = Math.max(
    1,
    Math.floor(Math.min(240, width * 0.76, height * 0.76)),
  );
  return { width: side, height: side };
}
async function createReader(id: string): Promise<Reader> {
  const { Html5Qrcode, Html5QrcodeSupportedFormats } =
    await import("html5-qrcode");
  return new Html5Qrcode(id, {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    verbose: false,
  });
}
export function cameraError(error: unknown): string {
  const name = (error as { name?: string })?.name ?? String(error);
  if (name.includes("NotAllowed") || name.includes("Permission"))
    return "Izin kamera ditolak. Izinkan kamera melalui pengaturan browser, atau masukkan nomor siswa.";
  if (name.includes("NotFound") || name.includes("DevicesNotFound"))
    return "Kamera tidak ditemukan. Gunakan input nomor siswa.";
  if (name.includes("NotReadable") || name.includes("TrackStart"))
    return "Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.";
  return "Kamera belum dapat dibuka. Coba kembali atau gunakan input nomor siswa.";
}
/** Serializes camera lifecycle; cancel/hidden-page requests also stop a delayed permission grant. */
export class QRCamera {
  private reader: Reader | null = null;
  private operations: Promise<void> = Promise.resolve();
  private epoch = 0;
  private wanted = false;
  private delivering = false;
  private last = "";
  private lastAt = 0;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private viewportSize = "";
  active = false;
  facing: "environment" | "user" = "environment";
  constructor(private options: Options) {}
  private element(id?: string) {
    return id && typeof document !== "undefined"
      ? document.getElementById(id)
      : null;
  }
  private paint(phase: Phase, text?: string) {
    const o = this.options,
      reader = this.element(o.readerId),
      placeholder = this.element(o.placeholderId),
      toggle = this.element(o.toggleId),
      status = this.element(o.statusId),
      stage = this.element(o.stageId);
    if (reader)
      reader.style.display =
        phase === "active" || phase === "starting" ? "block" : "none";
    if (placeholder) {
      placeholder.hidden = phase === "active" || phase === "starting";
      placeholder.style.display = placeholder.hidden ? "none" : "grid";
    }
    if (toggle) {
      (toggle as HTMLButtonElement).disabled = phase === "starting";
      toggle.textContent =
        phase === "starting"
          ? "Membuka kamera…"
          : phase === "active"
            ? "Matikan kamera"
            : "Aktifkan kamera";
      toggle.setAttribute("aria-pressed", String(phase === "active"));
    }
    if (status)
      status.textContent =
        text ??
        (phase === "active"
          ? "Kamera aktif · arahkan QR ke dalam bingkai"
          : phase === "starting"
            ? "Menunggu izin kamera…"
            : "Kamera nonaktif · input nomor siswa tetap tersedia");
    if (stage) stage.dataset.cameraState = phase;
    o.onState?.(phase);
  }
  private enqueue(work: () => Promise<void>) {
    const task = this.operations.then(work);
    this.operations = task.catch(() => undefined);
    return task;
  }
  private async halt() {
    if (this.active && this.reader) {
      try {
        await this.reader.stop();
      } catch {
        const video = this.element(this.options.readerId)?.querySelector(
          "video",
        );
        if (video?.srcObject)
          (video.srcObject as MediaStream)
            .getTracks()
            .forEach((track) => track.stop());
        this.reader = null;
      }
    }
    this.active = false;
    const zoom = this.element(this.options.zoomId);
    if (zoom) zoom.style.display = "none";
  }
  start(facing = this.facing): Promise<void> {
    this.facing = facing;
    this.wanted = true;
    const version = ++this.epoch;
    return this.enqueue(async () => {
      if (version !== this.epoch) return;
      if (this.active) return;
      this.paint("starting");
      const errorEl = this.element(this.options.errorId);
      if (errorEl) {
        errorEl.textContent = "";
        errorEl.style.display = "none";
      }
      try {
        if (typeof window !== "undefined" && !window.isSecureContext)
          throw new Error("HTTPS_REQUIRED");
        this.reader ??= await (this.options.factory ?? createReader)(
          this.options.readerId,
        );
        if (version !== this.epoch) return;
        await this.reader.start(
          { facingMode: this.facing },
          { fps: 8, qrbox: scanBox, aspectRatio: 1 },
          (value) => {
            void this.deliver(value);
          },
          () => undefined,
        );
        // The SDK resolves on `playing`, before the browser settles its play promise.
        // Settle playback before allowing an immediate stop/flip to remove the video.
        const video = this.element(this.options.readerId)?.querySelector(
          "video",
        );
        if (video?.srcObject) await video.play();
        this.active = true;
        if (version !== this.epoch || !this.wanted) {
          await this.halt();
          return;
        }
        this.paint("active");
        this.updateZoom();
        this.watchViewport();
      } catch (error) {
        await this.halt();
        if (version !== this.epoch) return;
        this.wanted = false;
        const text = String(error).includes("HTTPS_REQUIRED")
          ? "Kamera memerlukan HTTPS. Buka aplikasi melalui tautan resmi sekolah."
          : cameraError(error);
        this.paint("error", text);
        if (errorEl) {
          errorEl.textContent = text;
          errorEl.style.display = "block";
        }
      }
    });
  }
  stop(): Promise<void> {
    clearTimeout(this.resizeTimer);
    this.wanted = false;
    ++this.epoch;
    return this.enqueue(async () => {
      await this.halt();
      this.paint("off");
    });
  }
  async flip() {
    await this.stop();
    await this.start(this.facing === "environment" ? "user" : "environment");
  }
  private async deliver(value: string) {
    if (
      !this.wanted ||
      !this.active ||
      this.delivering ||
      this.options.canRead?.() === false
    )
      return;
    const now = Date.now();
    if (value === this.last && now - this.lastAt < 2000) return;
    this.delivering = true;
    this.last = value;
    this.lastAt = now;
    try {
      if (this.options.once) await this.stop();
      await this.options.onDecode(value);
    } catch {
      await this.stop();
      const text =
        "Pemindaian belum dapat diproses. Coba kembali atau masukkan nomor siswa.";
      this.paint("error", text);
      const error = this.element(this.options.errorId);
      if (error) {
        error.textContent = text;
        error.style.display = "block";
      }
    } finally {
      this.delivering = false;
    }
  }
  private watchViewport() {
    const reader = this.element(this.options.readerId);
    const viewport =
      reader?.closest<HTMLElement>(".scanner-viewport") ?? reader;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const size = () =>
      `${Math.round(viewport.getBoundingClientRect().width)}:${Math.round(viewport.getBoundingClientRect().height)}`;
    this.viewportSize = size();
    if (this.resizeObserver) return;
    this.resizeObserver = new ResizeObserver(() => {
      const next = size();
      if (next === this.viewportSize) return;
      this.viewportSize = next;
      if (
        !this.active ||
        !this.wanted ||
        viewport.clientWidth < 1 ||
        viewport.clientHeight < 1
      )
        return;
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        const version = this.epoch;
        void this.enqueue(async () => {
          if (!this.active || !this.wanted || version !== this.epoch) return;
          await this.halt();
          if (this.wanted && version === this.epoch)
            void this.start(this.facing);
        });
      }, 140);
    });
    this.resizeObserver.observe(viewport);
  }
  private track() {
    const video = this.element(this.options.readerId)?.querySelector("video");
    return video?.srcObject
      ? (video.srcObject as MediaStream).getVideoTracks()[0]
      : undefined;
  }
  private updateZoom() {
    const track = this.track(),
      caps = track?.getCapabilities?.() as
        | (MediaTrackCapabilities & { zoom?: { min: number; max: number } })
        | undefined;
    const box = this.element(this.options.zoomId);
    if (box) box.style.display = caps?.zoom ? "flex" : "none";
  }
  async setZoom(value: number) {
    const track = this.track(),
      range = (
        track?.getCapabilities?.() as
          | (MediaTrackCapabilities & { zoom?: { min: number; max: number } })
          | undefined
      )?.zoom;
    if (!range || !track) return;
    const zoom = Math.max(range.min, Math.min(range.max, value));
    try {
      await track.applyConstraints({
        advanced: [{ zoom } as MediaTrackConstraintSet],
      });
      this.element(this.options.zoomId)
        ?.querySelectorAll<HTMLButtonElement>("[data-zoom]")
        .forEach((button) =>
          button.classList.toggle(
            "active",
            Math.abs(Number(button.dataset.zoom) - zoom) < 0.3,
          ),
        );
    } catch {
      /* Keep the original, decodable preview when hardware zoom is unsupported. */
    }
  }
}
export function portalQRLink(value: string, base: string): string | null {
  try {
    const url = new URL(value),
      current = new URL(location.href),
      expected = new URL(base, current);
    const token =
      new URLSearchParams(url.hash.slice(1)).get("token") ??
      url.searchParams.get("token");
    if (!token || !/^[a-f0-9]{64}$/.test(token) || url.username || url.password)
      return null;
    if (
      url.origin !== current.origin &&
      !["https://www.aksis.co.id", "https://aksis.co.id"].includes(url.origin)
    )
      return null;
    if (
      url.pathname.replace(/\/$/, "") !== expected.pathname.replace(/\/$/, "")
    )
      return null;
    url.search = "";
    url.hash = new URLSearchParams({ token }).toString();
    return url.toString();
  } catch {
    return null;
  }
}
export function bindLoginCamera(base: string) {
  const button = document.getElementById(
      "btn-start-login-scan",
    ) as HTMLButtonElement,
    container = document.getElementById("login-scanner-container")!,
    cancel = document.getElementById("btn-cancel-login-scan")!,
    error = document.getElementById("login-error")!;
  const camera = new QRCamera({
    readerId: "login-qr-reader",
    errorId: "login-error",
    once: true,
    onDecode: (value) => {
      const link = portalQRLink(value, base);
      if (link) location.assign(link);
      else {
        error.textContent =
          "QR tidak sesuai portal ini. Gunakan QR akses dari admin sekolah.";
        error.style.display = "block";
        container.style.display = "none";
        button.style.display = "block";
      }
    },
  });
  button.onclick = () => {
    button.style.display = "none";
    container.style.display = "block";
    void camera.start().then(() => {
      if (!camera.active) {
        container.style.display = "none";
        button.style.display = "block";
      }
    });
  };
  cancel.onclick = () => {
    void camera.stop();
    container.style.display = "none";
    button.style.display = "block";
  };
  const stop = () => {
    void camera.stop();
    container.style.display = "none";
    button.style.display = "block";
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  window.addEventListener("pagehide", stop);
  return camera;
}
