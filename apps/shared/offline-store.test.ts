import { describe, it, expect, beforeEach } from "vitest";
import { StudentCache, OfflineQueue, BackgroundSyncCoordinator } from "./offline-store.js";

describe("StudentCache", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
    };
  });

  it("stores and resolves students by student_number, nisn, and card_uid", () => {
    const cache = new StudentCache("school-123");
    cache.put({
      id: "std-1",
      full_name: "Ahmad Dahlan",
      student_number: "STD001",
      nisn: "0011223344",
      cards: [
        { qr_key: "QR-AHMAD-1", card_uid: "UID-ABCD", card_serial: "SR-001" },
      ],
    });

    expect(cache.resolve("STD001")?.full_name).toBe("Ahmad Dahlan");
    expect(cache.resolve("0011223344")?.full_name).toBe("Ahmad Dahlan");
    expect(cache.resolve("UID-ABCD")?.full_name).toBe("Ahmad Dahlan");
    expect(cache.resolve("QR-AHMAD-1")?.full_name).toBe("Ahmad Dahlan");
    expect(cache.resolve("UNKNOWN")).toBeUndefined();
  });
});

describe("OfflineQueue", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    };
  });

  it("enqueues, retrieves pending, and marks items synced", () => {
    const queue = new OfflineQueue<{ card_uid: string }>("library-terminal-1");
    expect(queue.getPendingCount()).toBe(0);

    const item1 = queue.enqueue({ card_uid: "CARD-1" });
    const item2 = queue.enqueue({ card_uid: "CARD-2" });

    expect(queue.getPendingCount()).toBe(2);
    expect(queue.getPending()[0]?.payload.card_uid).toBe("CARD-1");

    queue.markSynced(item1.event_id);
    expect(queue.getPendingCount()).toBe(1);
    expect(queue.getPending()[0]?.payload.card_uid).toBe("CARD-2");
  });
});
