export type VoiceStatus = {
  enabled: boolean;
  hasVoice: boolean;
  isNatural: boolean;
  voiceName?: string;
  text: string;
};

function getSynth(): SpeechSynthesis | null {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    return window.speechSynthesis;
  }
  if (typeof speechSynthesis !== "undefined") {
    return speechSynthesis as SpeechSynthesis;
  }
  return null;
}

/**
 * NaturalVoice Engine (100% on-device natural human voice)
 * Uses high-quality system voices (Google Bahasa Indonesia on Android, Damayanti on iOS/macOS)
 * without robotic WebAssembly fallbacks.
 * When a device lacks Indonesian voice data, it guides the user with a 1-tap installation guide.
 */
export class NaturalVoice {
  enabled: boolean;
  private readonly key: string;
  private voice: SpeechSynthesisVoice | null = null;
  private queue: string[] = [];
  private current = "";
  private lastText = "";
  private lastAt = 0;
  private draining = false;
  private speechUnlocked = false;

  constructor(
    appKey: string,
    private readonly onStatus?: (status: VoiceStatus) => void
  ) {
    this.key = `aksis.${appKey}.voice.enabled.v1`;
    try {
      this.enabled = localStorage.getItem(this.key) !== "false";
    } catch {
      this.enabled = true;
    }

    this.voice = this.detectVoice();
    this.paint();

    if (typeof window !== "undefined") {
      const unlock = () => {
        this.unlock();
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      };
      window.addEventListener("pointerdown", unlock, { passive: true });
      window.addEventListener("keydown", unlock);

      if ("speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = () => {
          const prev = this.voice?.name;
          this.voice = this.detectVoice();
          if (this.voice?.name !== prev) {
            this.paint();
          }
        };
      }
    }
  }

  get available(): boolean {
    return this.enabled && this.voice !== null;
  }

  get hasIndonesianVoice(): boolean {
    return this.voice !== null;
  }

  get voiceName(): string | undefined {
    return this.voice?.name;
  }

  detectVoice(): SpeechSynthesisVoice | null {
    const synth = getSynth();
    if (!synth) return null;
    try {
      const voices = synth.getVoices() || [];
      if (!voices.length) return null;

      const indonesian = voices.filter((v) => {
        const lang = (v.lang || "").toLowerCase().replace("_", "-");
        return lang === "id-id" || lang.startsWith("id");
      });

      if (indonesian.length > 0) {
        // Preferred natural voices: Google Bahasa Indonesia, Damayanti (Apple), Natural, Gadis, Ardi
        const preferred =
          indonesian.find((v) => {
            const name = v.name.toLowerCase();
            return (
              name.includes("google") ||
              name.includes("damayanti") ||
              name.includes("natural") ||
              name.includes("gadis") ||
              name.includes("ardi")
            );
          }) ||
          indonesian.find((v) => v.localService) ||
          indonesian[0];

        return preferred;
      }

      // Fallback search by voice name if language tag is not standardized
      const byName = voices.find((v) =>
        v.name.toLowerCase().includes("indonesia")
      );
      if (byName) return byName;
    } catch {
      /* Voice lookup fallback */
    }
    return null;
  }

  paint(): void {
    const hasVoice = this.voice !== null;
    const text = !this.enabled
      ? "Suara dinonaktifkan"
      : hasVoice
      ? `Suara alami aktif (${this.voice?.name ?? "Indonesia"})`
      : "⚠️ Paket suara Bahasa Indonesia belum terpasang di HP ini";

    this.onStatus?.({
      enabled: this.enabled,
      hasVoice,
      isNatural: hasVoice,
      voiceName: this.voice?.name,
      text,
    });
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    try {
      localStorage.setItem(this.key, String(value));
    } catch {}
    if (!value) {
      this.stop();
    } else {
      this.unlock();
    }
    this.paint();
  }

  unlock(): void {
    if (
      !this.enabled ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      if (!this.speechUnlocked) {
        const primer = new SpeechSynthesisUtterance("");
        primer.volume = 0;
        primer.rate = 2;
        window.speechSynthesis.speak(primer);
        this.speechUnlocked = true;
      }
    } catch {
      /* Audio gesture unlock */
    }
  }

  async prepare(): Promise<void> {
    this.voice = this.detectVoice();
    this.paint();
  }

  speak(text: string): void {
    const name = text.trim().slice(0, 160);
    if (!this.enabled || !name) return;

    if (!this.voice) {
      this.voice = this.detectVoice();
      if (!this.voice) {
        this.paint();
        return;
      }
    }

    // Debounce duplicate spoken names within 8 seconds to prevent queue clutter
    if (
      name === this.current ||
      this.queue.includes(name) ||
      (name === this.lastText && Date.now() - this.lastAt < 8000)
    ) {
      return;
    }

    this.queue.push(name);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length && this.enabled) {
        const text = this.queue.shift()!;
        this.current = text;
        await this.speakUtterance(text);
        this.lastText = text;
        this.lastAt = Date.now();
        this.current = "";
      }
    } finally {
      this.current = "";
      this.draining = false;
      if (this.queue.length && this.enabled) {
        void this.drain();
      }
    }
  }

  private speakUtterance(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        !this.voice
      ) {
        resolve();
        return;
      }

      try {
        const utterance = new SpeechSynthesisUtterance(text);
        try {
          utterance.voice = this.voice;
        } catch {
          /* Safely handle mock voice objects in test environments */
        }
        utterance.lang = this.voice.lang || "id-ID";
        utterance.rate = 0.96;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        let finished = false;
        const done = () => {
          if (!finished) {
            finished = true;
            clearTimeout(timeout);
            resolve();
          }
        };

        const timeout = window.setTimeout(done, 6000);
        utterance.onend = done;
        utterance.onerror = done;

        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      } catch {
        resolve();
      }
    });
  }

  stop(): void {
    this.queue = [];
    this.current = "";
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  openGuide(): void {
    if (typeof document === "undefined") return;
    ensureVoiceGuideModal();
    const dialog = document.getElementById(
      "aksis-voice-guide-modal"
    ) as HTMLDialogElement | null;
    if (dialog) {
      if (typeof dialog.showModal === "function") {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute("open", "");
        }
      } else {
        dialog.setAttribute("open", "");
      }
    }
  }
}

/**
 * Ensures the interactive voice setup guide modal exists in DOM.
 * Works seamlessly across Android and iOS devices.
 */
export function ensureVoiceGuideModal(): HTMLDialogElement | null {
  if (typeof document === "undefined") return null;
  let dialog = document.getElementById(
    "aksis-voice-guide-modal"
  ) as HTMLDialogElement | null;
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "aksis-voice-guide-modal";
  dialog.className = "voice-guide-modal";

  const isIOS =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

  dialog.innerHTML = `
    <div class="voice-guide-content">
      <div class="voice-guide-header">
        <h3>📢 Pasang Suara Bahasa Indonesia Alami</h3>
        <button type="button" class="voice-guide-close" aria-label="Tutup" id="voice-guide-close-x">&times;</button>
      </div>
      <p style="margin:0;font-size:0.88rem;color:#475569;">
        Agar nama siswa terdengar jernih mirip manusia asli tanpa robotik, aktifkan paket suara resmi bawaan HP Anda:
      </p>
      <div class="voice-guide-platform-tabs">
        <button type="button" id="tab-guide-android" class="voice-guide-tab-btn ${
          !isIOS ? "active" : ""
        }">🤖 Android (Samsung, Xiaomi, Oppo, dll)</button>
        <button type="button" id="tab-guide-ios" class="voice-guide-tab-btn ${
          isIOS ? "active" : ""
        }">🍎 iPhone / iPad</button>
      </div>

      <div id="content-guide-android" class="voice-guide-steps" style="${
        isIOS ? "display:none;" : ""
      }">
        <ol>
          <li>Buka <b>Pengaturan (Settings)</b> di HP Android Anda.</li>
          <li>Ketik <b>"Teks ke ucapan"</b> atau <b>"Text-to-speech"</b> di kolom pencarian pengaturan (biasanya di <i>Aksesibilitas</i> atau <i>Manajemen Umum</i>).</li>
          <li>Pilih <b>Mesin yang disukai</b> ➔ pilih <b>Layanan Suara Google (Speech Services by Google)</b>.</li>
          <li>Ketuk ikon setelan ⚙️ di sampingnya ➔ <b>Pasang data suara</b> ➔ pilih <b>Bahasa Indonesia</b> dan ketuk unduh.</li>
        </ol>
        <div style="margin-top:12px;text-align:center;">
          <a href="https://play.google.com/store/apps/details?id=com.google.android.tts" target="_blank" rel="noopener noreferrer" class="voice-guide-playstore">
            📥 Buka Google Speech Services di Play Store
          </a>
        </div>
      </div>

      <div id="content-guide-ios" class="voice-guide-steps" style="${
        !isIOS ? "display:none;" : ""
      }">
        <ol>
          <li>Buka <b>Pengaturan (Settings)</b> di iPhone / iPad Anda.</li>
          <li>Pilih menu <b>Aksesibilitas (Accessibility)</b> ➔ ketuk <b>Konten Lisan (Spoken Content)</b>.</li>
          <li>Ketuk <b>Suara (Voices)</b> ➔ pilih <b>Bahasa Indonesia</b>.</li>
          <li>Unduh suara <b>Damayanti</b> (disarankan memilih varian <i>Kualitas Ditingkatkan / Enhanced</i>).</li>
        </ol>
      </div>

      <p class="voice-guide-note">
        💡 <b>Deteksi Otomatis:</b> Begitu paket suara selesai diunduh di setelan HP, aplikasi ini akan langsung mengaktifkan suara manusia alami tanpa perlu instal ulang atau memuat ulang halaman.
      </p>

      <button type="button" id="voice-guide-close-btn" style="width:100%;min-height:44px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:10px;font-weight:600;cursor:pointer;">Tutup</button>
    </div>
  `;

  document.body.appendChild(dialog);

  const btnAndroid = dialog.querySelector("#tab-guide-android");
  const btnIOS = dialog.querySelector("#tab-guide-ios");
  const contentAndroid = dialog.querySelector(
    "#content-guide-android"
  ) as HTMLElement;
  const contentIOS = dialog.querySelector(
    "#content-guide-ios"
  ) as HTMLElement;

  btnAndroid?.addEventListener("click", () => {
    btnAndroid.classList.add("active");
    btnIOS?.classList.remove("active");
    contentAndroid.style.display = "block";
    contentIOS.style.display = "none";
  });

  btnIOS?.addEventListener("click", () => {
    btnIOS.classList.add("active");
    btnAndroid?.classList.remove("active");
    contentIOS.style.display = "block";
    contentAndroid.style.display = "none";
  });

  const closeDialog = () => {
    try {
      dialog?.close();
    } catch {
      dialog?.removeAttribute("open");
    }
  };

  dialog
    .querySelector("#voice-guide-close-x")
    ?.addEventListener("click", closeDialog);
  dialog
    .querySelector("#voice-guide-close-btn")
    ?.addEventListener("click", closeDialog);

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeDialog();
  });

  return dialog;
}
