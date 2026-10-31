/**
 * Aksis Shared Natural Voice Engine
 * Provides natural on-device Indonesian speech synthesis (Google Bahasa Indonesia / Apple Damayanti)
 * with mobile audio unlocking, queue management, and offline fallback.
 * Student names and identities never leave the user's device.
 */

export type VoiceStatus = {
  enabled: boolean;
  text: string;
  isNatural: boolean;
  voiceName?: string;
};

export class NaturalVoice {
  enabled: boolean;
  private naturalVoice: SpeechSynthesisVoice | null = null;
  private queue: string[] = [];
  private isProcessing = false;
  private generation = 0;
  private audioCtx: AudioContext | null = null;
  private speechUnlocked = false;
  private ready = false;
  private readonly preferenceKey: string;

  constructor(
    appKey: string,
    private readonly onStatus?: (status: VoiceStatus) => void,
  ) {
    this.preferenceKey = `aksis.${appKey}.voice.enabled.v1`;
    this.enabled =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(this.preferenceKey) !== "false"
        : true;

    this.detectNaturalVoice();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.detectNaturalVoice();
        this.paint();
      };
    }

    this.bindAutoUnlock();
    this.paint();
  }

  private detectNaturalVoice(): SpeechSynthesisVoice | null {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      this.naturalVoice = null;
      this.ready = true;
      return null;
    }

    try {
      const voices = window.speechSynthesis.getVoices() || [];
      if (!voices.length) {
        this.ready = true;
        return this.naturalVoice;
      }

      // Prioritize Indonesian voices
      const idVoices = voices.filter((v) => {
        const lang = (v.lang || "").toLowerCase().replace("_", "-");
        return lang === "id-id" || lang.startsWith("id");
      });

      if (idVoices.length > 0) {
        const preferred =
          idVoices.find((v) => {
            const name = v.name.toLowerCase();
            return (
              name.includes("google") ||
              name.includes("damayanti") ||
              name.includes("natural") ||
              name.includes("gadis") ||
              name.includes("ardi")
            );
          }) ||
          idVoices.find((v) => v.localService) ||
          idVoices[0];

        this.naturalVoice = preferred;
        this.ready = true;
        return preferred;
      }

      // Secondary match by name containing indonesia
      const byName = voices.find((v) =>
        v.name.toLowerCase().includes("indonesia"),
      );
      if (byName) {
        this.naturalVoice = byName;
        this.ready = true;
        return byName;
      }
    } catch {
      /* Fallback gracefully */
    }

    this.ready = true;
    return this.naturalVoice;
  }

  private paint() {
    if (!this.onStatus) return;
    const isNatural = Boolean(this.naturalVoice);
    const text = !this.enabled
      ? "Suara dinonaktifkan"
      : !this.ready
        ? "Menyiapkan suara…"
        : isNatural
          ? "Suara alami siap digunakan offline"
          : "Suara siap digunakan offline";

    this.onStatus({
      enabled: this.enabled,
      text,
      isNatural,
      voiceName: this.naturalVoice?.name,
    });
  }

  /**
   * Automatically bind user gestures to unlock audio playback.
   */
  private bindAutoUnlock() {
    if (typeof window === "undefined") return;
    const unlockHandler = () => {
      this.unlock();
      window.removeEventListener("pointerdown", unlockHandler);
      window.removeEventListener("touchstart", unlockHandler);
      window.removeEventListener("keydown", unlockHandler);
    };
    window.addEventListener("pointerdown", unlockHandler, { passive: true });
    window.addEventListener("touchstart", unlockHandler, { passive: true });
    window.addEventListener("keydown", unlockHandler, { passive: true });
  }

  /**
   * Unlock AudioContext and prime SpeechSynthesis.
   */
  unlock() {
    if (!this.enabled) return;

    // Web Audio Unlock
    try {
      const Constructor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Constructor) {
        this.audioCtx ??= new Constructor();
        if (this.audioCtx.state === "suspended") {
          void this.audioCtx.resume().catch(() => undefined);
        }
      }
    } catch {
      /* Ignore audio context errors */
    }

    // SpeechSynthesis Unlock
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
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
      }
    } catch {
      /* Ignore speech synthesis unlock errors */
    }
  }

  setEnabled(val: boolean) {
    this.enabled = val;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(this.preferenceKey, String(val));
      } catch {
        /* Storage quota */
      }
    }
    if (!val) this.stop();
    this.paint();
    if (val) this.unlock();
  }

  speak(text: string) {
    if (!this.enabled || !text.trim()) return;
    this.queue.push(text.trim().slice(0, 200));
    void this.drain();
  }

  private async speakNatural(text: string): Promise<void> {
    return new Promise<void>((resolve) => {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        !this.naturalVoice
      ) {
        resolve();
        return;
      }

      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.naturalVoice;
        utterance.lang = "id-ID";
        utterance.rate = 0.96;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            clearTimeout(watchdog);
            resolve();
          }
        };

        const watchdog = window.setTimeout(finish, 6000);
        utterance.onend = finish;
        utterance.onerror = finish;

        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      } catch {
        resolve();
      }
    });
  }

  private playToneFallback() {
    try {
      if (!this.audioCtx) {
        const Constructor =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (Constructor) this.audioCtx = new Constructor();
      }
      if (this.audioCtx) {
        if (this.audioCtx.state === "suspended") {
          void this.audioCtx.resume();
        }
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.12);
      }
    } catch {
      /* Tone fallback */
    }
  }

  private async drain() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    const currentGen = this.generation;

    try {
      while (this.queue.length && this.enabled && currentGen === this.generation) {
        const nextText = this.queue.shift()!;
        if (!this.enabled || currentGen !== this.generation) break;

        if (this.naturalVoice && "speechSynthesis" in window) {
          await this.speakNatural(nextText);
        } else {
          this.playToneFallback();
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    } finally {
      this.isProcessing = false;
      if (this.queue.length && this.enabled && currentGen === this.generation) {
        void this.drain();
      }
    }
  }

  stop() {
    this.generation++;
    this.queue = [];
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      /* Ignore cancel errors */
    }
  }
}
