import { describe, expect, it, beforeEach } from "vitest";
import { NaturalVoice } from "./natural-voice";

const mockStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    clear: () => {
      store = {};
    },
  };
})();

(globalThis as any).localStorage = mockStorage;

describe("NaturalVoice", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("initializes with default enabled state", () => {
    const statuses: any[] = [];
    const voice = new NaturalVoice("ekskul", (s) => statuses.push(s));
    expect(voice.enabled).toBe(true);
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0].enabled).toBe(true);
  });

  it("persists enabled state in localStorage", () => {
    const voice = new NaturalVoice("ekskul");
    voice.setEnabled(false);
    expect(mockStorage.getItem("aksis.ekskul.voice.enabled.v1")).toBe("false");
    expect(voice.enabled).toBe(false);

    voice.setEnabled(true);
    expect(mockStorage.getItem("aksis.ekskul.voice.enabled.v1")).toBe("true");
    expect(voice.enabled).toBe(true);
  });

  it("queues text and handles speak gracefully", () => {
    const voice = new NaturalVoice("perpustakaan");
    voice.speak("Andi Pratama");
    expect(voice.enabled).toBe(true);
    voice.stop();
  });

  it("detects Indonesian voices and prioritizes Google Bahasa Indonesia / Damayanti", () => {
    const mockVoices = [
      { name: "Microsoft David", lang: "en-US", localService: true },
      { name: "Google Bahasa Indonesia", lang: "id-ID", localService: true },
    ] as any;

    (globalThis as any).speechSynthesis = {
      getVoices: () => mockVoices,
      speak: () => {},
      cancel: () => {},
      resume: () => {},
      paused: false,
    };

    const statuses: any[] = [];
    const voice = new NaturalVoice("attendance", (s) => statuses.push(s));
    expect(voice.hasIndonesianVoice).toBe(true);
    expect(voice.voiceName).toBe("Google Bahasa Indonesia");
    expect(statuses.at(-1)?.text).toContain("Google Bahasa Indonesia");
  });

  it("indicates missing voice when no Indonesian voice is available in the device", () => {
    const mockVoices = [
      { name: "Microsoft David", lang: "en-US", localService: true },
    ] as any;

    (globalThis as any).speechSynthesis = {
      getVoices: () => mockVoices,
      speak: () => {},
      cancel: () => {},
      resume: () => {},
      paused: false,
    };

    const statuses: any[] = [];
    const voice = new NaturalVoice("attendance", (s) => statuses.push(s));
    expect(voice.hasIndonesianVoice).toBe(false);
    expect(statuses.at(-1)?.text).toContain("Paket suara Bahasa Indonesia belum terpasang");
  });
});
