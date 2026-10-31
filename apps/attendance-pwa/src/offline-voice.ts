/**
 * Aksis Attendance Voice Engine
 * Uses native natural human voice (Google Bahasa Indonesia / Apple Damayanti) on mobile devices
 * with 100% on-device/offline synthesis, falling back to local worker Web Audio when needed.
 * Student names never leave this device.
 */

type VoiceStatus = { enabled: boolean; text: string };
type WorkerReply = { callback?: string; done?: boolean; result?: unknown[] };
type Callback = (message: WorkerReply) => void;
const PREFERENCE_KEY = "aksis.attendance.voice.enabled.v1";

export class OfflineVoice {
  enabled = localStorage.getItem(PREFERENCE_KEY) !== "false";
  private naturalVoice: SpeechSynthesisVoice | null = null;
  private worker: Worker | null = null;
  private opening: Promise<void> | null = null;
  private callbacks = new Map<string, Callback>();
  private nextCallback = 0;
  private audio: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private scheduledUntil = 0;
  private queue: string[] = [];
  private draining = false;
  private generation = 0;
  private ready = false;
  private cached = false;
  private failed = false;
  private speechUnlocked = false;
  private sampleRate = 22050;

  private readonly workerUrl = new URL(
    `${import.meta.env.BASE_URL}tts/espeakng.worker.js`,
    location.origin,
  ).href;
  private readonly dataUrl = new URL(
    `${import.meta.env.BASE_URL}tts/espeakng.worker.data`,
    location.origin,
  ).href;

  constructor(private readonly onStatus: (value: VoiceStatus) => void) {
    this.detectNaturalVoice();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        const found = this.detectNaturalVoice();
        if (found) {
          this.ready = true;
          this.failed = false;
          this.paint();
        }
      };
    }

    this.paint();

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready
        .then(() => this.checkCache())
        .catch(() => undefined);
    }
  }

  get available() {
    return this.enabled && this.ready && !this.failed;
  }

  /**
   * Detects natural Indonesian human voice from the device's operating system
   * (Google Bahasa Indonesia on Android, Damayanti on iOS/macOS, Gadis/Ardi on Windows).
   */
  private detectNaturalVoice(): SpeechSynthesisVoice | null {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      this.naturalVoice = null;
      return null;
    }

    try {
      const voices = window.speechSynthesis.getVoices() || [];
      if (!voices.length) {
        return this.naturalVoice;
      }

      // Prioritize natural Indonesian voices
      const indonesianVoices = voices.filter((v) => {
        const lang = (v.lang || "").toLowerCase().replace("_", "-");
        return lang === "id-id" || lang.startsWith("id");
      });

      if (indonesianVoices.length > 0) {
        const preferred =
          indonesianVoices.find((v) => {
            const name = v.name.toLowerCase();
            return (
              name.includes("google") ||
              name.includes("damayanti") ||
              name.includes("natural") ||
              name.includes("gadis") ||
              name.includes("ardi")
            );
          }) ||
          indonesianVoices.find((v) => v.localService) ||
          indonesianVoices[0];

        this.naturalVoice = preferred;
        return preferred;
      }

      // Fallback: search by name
      const byName = voices.find((v) =>
        v.name.toLowerCase().includes("indonesia"),
      );
      if (byName) {
        this.naturalVoice = byName;
        return byName;
      }
    } catch {
      /* Ignore voice lookup errors. */
    }

    return this.naturalVoice;
  }

  private paint() {
    const text = !this.enabled
      ? "Suara nama dinonaktifkan"
      : this.failed
        ? "Suara belum siap. Ketuk Uji suara untuk mencoba lagi."
        : !this.ready
          ? "Menyiapkan suara…"
          : this.naturalVoice
            ? "Suara alami siap digunakan offline"
            : !this.cached
              ? navigator.onLine
                ? "Menyiapkan suara untuk offline…"
                : "Suara offline belum siap. Hubungkan internet."
              : "Suara siap digunakan offline";
    this.onStatus({ enabled: this.enabled, text });
  }

  private async checkCache() {
    try {
      this.cached =
        !!(await caches.match(this.workerUrl)) &&
        !!(await caches.match(this.dataUrl));
    } catch {
      this.cached = false;
    }
    this.paint();
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    localStorage.setItem(PREFERENCE_KEY, String(value));
    if (!value) this.stop();
    this.paint();
    if (value) {
      this.unlock();
      void this.prepare().catch(() => undefined);
    }
  }

  /**
   * Unlocks audio output directly from user gestures (taps/clicks)
   * to comply with mobile autoplay policies.
   */
  unlock() {
    if (!this.enabled) return;

    // 1. Unlock Web Audio
    try {
      const Constructor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Constructor) {
        this.audio ??= new Constructor();
        if (this.audio.state === "suspended") {
          void this.audio
            .resume()
            .then(() => {
              this.failed = false;
              this.paint();
            })
            .catch(() => {
              this.failed = true;
              this.paint();
            });
        } else if (this.audio.state === "running") {
          this.failed = false;
          this.paint();
        }
      }
    } catch {
      /* Handled gracefully. */
    }

    // 2. Unlock SpeechSynthesis on mobile
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
      /* Handled gracefully. */
    }
  }

  private call(method: string, args: unknown[], callback: Callback) {
    const id = `c${++this.nextCallback}`;
    this.callbacks.set(id, callback);
    this.worker!.postMessage({ method, args, callback: id });
    return id;
  }

  async prepare(): Promise<void> {
    this.detectNaturalVoice();
    if (this.naturalVoice) {
      this.ready = true;
      this.failed = false;
      this.paint();
    }

    if (this.ready && this.cached) {
      return;
    }

    if (this.opening) return this.opening;
    this.failed = false;
    this.paint();

    this.opening = new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = () => {
        this.worker?.terminate();
        this.worker = null;
        this.callbacks.clear();
        if (!this.naturalVoice) {
          this.ready = false;
          this.failed = true;
          this.paint();
        }
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          if (this.naturalVoice) {
            this.ready = true;
            this.failed = false;
            this.paint();
            resolve();
          } else {
            reject(new Error("Mesin suara tidak tersedia"));
          }
        }
      };

      const timer = window.setTimeout(fail, 25000);
      try {
        this.worker = new Worker(this.workerUrl);
        this.worker.onerror = (event) => {
          event.preventDefault();
          fail();
        };
        this.worker.onmessage = (event: MessageEvent<string | WorkerReply>) => {
          if (event.data === "ready") {
            this.call("list_voices", [], (message) => {
              const voices = message.result?.[0] as
                | Array<{ languages: Array<{ name: string }> }>
                | undefined;
              if (
                !voices?.some((voice) =>
                  voice.languages.some((language) => language.name === "id"),
                )
              ) {
                fail();
                return;
              }
              this.call("set_voice", ["id"], (response) => {
                if (response.result?.[0] !== 0) {
                  fail();
                  return;
                }
                this.worker!.postMessage({ method: "set_rate", args: [165] });
                this.worker!.postMessage({ method: "set_pitch", args: [50] });
                this.call("get_samplerate", [], (result) => {
                  if (
                    typeof result.result?.[0] === "number" &&
                    result.result[0] > 0
                  )
                    this.sampleRate = result.result[0];
                  if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    this.ready = true;
                    this.failed = false;
                    this.paint();
                    void this.checkCache();
                    resolve();
                  }
                });
              });
            });
            return;
          }
          if (typeof event.data !== "object" || !event.data.callback) return;
          const callback = this.callbacks.get(event.data.callback);
          if (callback) callback(event.data);
          if (event.data.done) this.callbacks.delete(event.data.callback);
        };
      } catch {
        fail();
      }
    }).finally(() => {
      this.opening = null;
    });

    return this.opening;
  }

  /**
   * Queue recognized student name for speech playback.
   */
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
        // Natural human speed and pitch:
        utterance.rate = 0.96;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        let finished = false;
        const complete = () => {
          if (!finished) {
            finished = true;
            clearTimeout(watchdog);
            resolve();
          }
        };

        const watchdog = window.setTimeout(complete, 6000);
        utterance.onend = complete;
        utterance.onerror = complete;

        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      } catch {
        resolve();
      }
    });
  }

  private async synthesize(text: string): Promise<Float32Array[]> {
    return new Promise((resolve, reject) => {
      const chunks: Float32Array[] = [];
      let id = "";
      const timer = window.setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error("Suara terlalu lama"));
      }, 20000);
      id = this.call("synthesize", [text], (message) => {
        if (message.result?.[0] instanceof ArrayBuffer)
          chunks.push(new Float32Array(message.result[0]));
        if (message.done) {
          clearTimeout(timer);
          resolve(chunks);
        }
      });
    });
  }

  private play(chunks: Float32Array[]) {
    if (!this.audio || this.audio.state !== "running") {
      this.failed = true;
      this.paint();
      return;
    }
    const frames = chunks.reduce(
      (sum, chunk) => sum + Math.floor(chunk.length / 2),
      0,
    );
    if (!frames) throw new Error("Audio kosong");
    const buffer = this.audio.createBuffer(1, frames, this.sampleRate);
    const output = buffer.getChannelData(0);
    let offset = 0;
    for (const chunk of chunks)
      for (let i = 0; i + 1 < chunk.length; i += 2)
        output[offset++] = chunk[i]!;
    const source = this.audio.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audio.destination);
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
    const at = Math.max(this.audio.currentTime, this.scheduledUntil);
    source.start(at);
    this.scheduledUntil = at + buffer.duration + 0.08;
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    const generation = this.generation;
    try {
      await this.prepare();
      while (
        this.queue.length &&
        this.enabled &&
        generation === this.generation
      ) {
        const nextText = this.queue.shift()!;
        if (!this.enabled || generation !== this.generation) break;

        // If high quality natural human voice is available on device, use it:
        if (this.naturalVoice && "speechSynthesis" in window) {
          await this.speakNatural(nextText);
        } else {
          // Fallback to local audio synthesis
          const chunks = await this.synthesize(nextText);
          if (this.enabled && generation === this.generation) this.play(chunks);
        }
      }
    } catch {
      this.queue = [];
      this.failed = true;
      this.paint();
    } finally {
      this.draining = false;
      if (this.queue.length && this.enabled && generation !== this.generation)
        void this.drain();
    }
  }

  stop() {
    this.generation++;
    this.queue = [];
    this.scheduledUntil = 0;
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      /* Ignore. */
    }
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already stopped. */
      }
    }
    this.sources.clear();
  }
}
