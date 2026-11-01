/**
 * Shared Offline Store & Background Sync Coordinator for AKSIS PWAs.
 * Enables instant QR scanning (<50ms) by decoupling physical scanning from network roundtrips.
 */

export type CachedCard = {
  qr_key?: string;
  card_uid?: string;
  card_serial?: string;
  expires_at?: string;
};

export type CachedStudent = {
  id: string;
  full_name: string;
  student_number?: string;
  nisn?: string | null;
  class_name?: string | null;
  photo_url?: string | null;
  cards?: CachedCard[];
};

export type QueueItem<T> = {
  event_id: string;
  created_at: string;
  status: "PENDING" | "SYNCED" | "FAILED";
  retry_count: number;
  payload: T;
  last_error?: string;
};

/** Safe localStorage wrapper that handles browser storage quotas or missing localStorage. */
const storage = {
  get(key: string): string | null {
    try {
      if (typeof localStorage !== "undefined") {
        return localStorage.getItem(key);
      }
    } catch {}
    return null;
  },
  set(key: string, val: string): void {
    if (typeof localStorage === "undefined") throw new Error("Penyimpanan perangkat tidak tersedia");
    localStorage.setItem(key, val);
  },
  remove(key: string): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(key);
      }
    } catch {}
  },
};

export class StudentCache {
  constructor(private scope: string | (() => string)) {}
  private get cacheKey(): string { return `aksis_student_cache_${typeof this.scope === "function" ? this.scope() : this.scope}`; }

  getAll(): CachedStudent[] {
    const raw = storage.get(this.cacheKey);
    if (!raw) return [];
    try {
      const snapshot = JSON.parse(raw) as { saved_at?: number; students?: CachedStudent[] };
      if (!snapshot.saved_at || Date.now() - snapshot.saved_at > 7 * 24 * 60 * 60 * 1000 || !Array.isArray(snapshot.students)) return [];
      return snapshot.students;
    } catch {
      return [];
    }
  }

  saveAll(students: CachedStudent[]): void {
    storage.set(this.cacheKey, JSON.stringify({ saved_at: Date.now(), students }));
  }

  put(student: CachedStudent): void {
    const list = this.getAll();
    const index = list.findIndex((s) => s.id === student.id);
    if (index >= 0) {
      list[index] = { ...list[index], ...student };
    } else {
      list.push(student);
    }
    // Limit cache size to reasonable bounds (e.g. 5000 students)
    if (list.length > 5000) list.splice(0, list.length - 5000);
    try {
      const current = JSON.parse(storage.get(this.cacheKey) ?? "null") as {saved_at?:number}|null;
      const previous = current?.saved_at;
      const savedAt = previous && Date.now() - previous <= 7 * 24 * 60 * 60 * 1000 ? previous : Date.now();
      storage.set(this.cacheKey, JSON.stringify({saved_at:savedAt,students:list}));
    } catch { /* A failed cache update must not change an already saved server transaction. */ }
  }

  resolve(identifier: string, atIso?: string): CachedStudent | undefined {
    const raw = identifier.trim().toUpperCase();
    if (!raw) return undefined;
    const now = atIso ?? new Date().toISOString();
    const list = this.getAll();

    const matches = list.filter((s) => {
      // Direct NISN, student number, or UUID match
      if (
        [s.id, s.student_number, s.nisn].some(
          (v) => v && v.toUpperCase() === raw,
        )
      ) {
        return true;
      }
      // Card QR, UID, or Serial match
      if (
        s.cards?.some((c) => {
          if (c.expires_at && Date.parse(c.expires_at) <= Date.parse(now)) {
            return false;
          }
          return [c.qr_key, c.card_uid, c.card_serial].some(
            (v) => v && v.toUpperCase() === raw,
          );
        })
      ) {
        return true;
      }
      return false;
    });

    return matches.length === 1 ? matches[0] : undefined;
  }
}

export class OfflineQueue<T> {
  constructor(private scope: string | (() => string)) {}
  private get queueKey(): string { return `aksis_queue_${typeof this.scope === "function" ? this.scope() : this.scope}`; }

  getAll(): QueueItem<T>[] {
    const raw = storage.get(this.queueKey);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as QueueItem<T>[];
    } catch {
      return [];
    }
  }

  private save(items: QueueItem<T>[]): void {
    storage.set(this.queueKey, JSON.stringify(items));
  }

  enqueue(payload: T, customEventId?: string): QueueItem<T> {
    const items = this.getAll();
    const item: QueueItem<T> = {
      event_id:
        customEventId ??
        (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      created_at: new Date().toISOString(),
      status: "PENDING",
      retry_count: 0,
      payload,
    };
    items.push(item);
    this.save(items);
    return item;
  }

  getPending(): QueueItem<T>[] {
    return this.getAll().filter((item) => item.status === "PENDING");
  }

  getPendingCount(): number {
    return this.getPending().length;
  }

  markSynced(eventId: string): void {
    const items = this.getAll().filter((item) => item.event_id !== eventId);
    this.save(items);
  }

  markFailed(eventId: string, error?: string): void {
    const items = this.getAll();
    const target = items.find((item) => item.event_id === eventId);
    if (target) {
      target.retry_count += 1;
      target.last_error = error;
      this.save(items);
    }
  }

  clear(): void {
    storage.remove(this.queueKey);
  }
}

export type SyncHandler<T> = (item: QueueItem<T>) => Promise<boolean>;

export class BackgroundSyncCoordinator<T> {
  private queue: OfflineQueue<T>;
  private handler: SyncHandler<T>;
  private intervalMs: number;
  private intervalId: number | undefined;
  private syncing = false;
  private onStatusChange?: (isSyncing: boolean, pendingCount: number) => void;

  constructor(options: {
    queue: OfflineQueue<T>;
    handler: SyncHandler<T>;
    intervalMs?: number;
    onStatusChange?: (isSyncing: boolean, pendingCount: number) => void;
  }) {
    this.queue = options.queue;
    this.handler = options.handler;
    this.intervalMs = options.intervalMs ?? 8500;
    this.onStatusChange = options.onStatusChange;
  }

  start(): void {
    this.stop();

    // Regular interval sync
    this.intervalId = window.setInterval(() => {
      void this.sync();
    }, this.intervalMs);

    // Online event trigger
    window.addEventListener("online", this.handleOnline);

    // Tab visibility recovery trigger
    document.addEventListener("visibilitychange", this.handleVisibility);

    // Run initial sync check
    void this.sync();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    window.removeEventListener("online", this.handleOnline);
    document.removeEventListener("visibilitychange", this.handleVisibility);
  }

  private handleOnline = (): void => {
    void this.sync();
  };

  private handleVisibility = (): void => {
    if (!document.hidden) {
      void this.sync();
    }
  };

  async sync(): Promise<void> {
    if (this.syncing) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.notifyStatus();
      return;
    }

    const pending = this.queue.getPending();
    if (pending.length === 0) {
      this.notifyStatus();
      return;
    }

    this.syncing = true;
    this.notifyStatus();

    try {
      for (const item of pending) {
        try {
          const success = await this.handler(item);
          if (success) {
            this.queue.markSynced(item.event_id);
          } else {
            this.queue.markFailed(item.event_id, "Sync rejected");
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.queue.markFailed(item.event_id, message);
          // If network error occurred, stop current batch and retry later
          break;
        }
      }
    } finally {
      this.syncing = false;
      this.notifyStatus();
    }
  }

  private notifyStatus(): void {
    if (this.onStatusChange) {
      this.onStatusChange(this.syncing, this.queue.getPendingCount());
    }
  }
}

/** Fetch tenant-scoped roster silently in background; atomic replace only when complete. */
export async function syncPortalRoster(
  portal: { context: { id: string; school_id: string } | null; request<T>(path: string): Promise<T> },
  cache: StudentCache,
  force = false
): Promise<boolean> {
  const context = portal.context;
  if (!context || (typeof navigator !== "undefined" && !navigator.onLine)) return false;
  try {
    const students: CachedStudent[] = [];
    let cursor: string | null = null;
    do {
      const page: { school_id: string; students: CachedStudent[]; next_cursor: string | null } = await portal.request(
        `/students/portal-roster${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`
      );
      if (page.school_id !== context.school_id || portal.context?.id !== context.id || portal.context?.school_id !== context.school_id) {
        return false;
      }
      if (!Array.isArray(page.students) || (page.next_cursor === cursor && cursor !== null)) {
        return false;
      }
      students.push(...page.students);
      cursor = page.next_cursor;
    } while (cursor);

    if (students.length > 0 || force) {
      cache.saveAll(students);
    }
    return true;
  } catch {
    return false;
  }
}

/** Refresh a complete, tenant-scoped roster in the background periodically with jitter; replace only after all pages arrive. */
export function startRosterRefresh(
  portal: { context: { id: string; school_id: string } | null; request<T>(path: string): Promise<T> },
  cache: StudentCache,
  intervalMs = 20 * 60_000
): () => void {
  let loading = false, lastScope = '', lastUpdate = 0;
  const refresh = async () => {
    const context = portal.context;
    if (!context || (typeof navigator !== "undefined" && !navigator.onLine) || loading) return;
    const scope = `${context.school_id}:${context.id}`;
    const jitter = Math.floor(Math.random() * 60_000);
    if (scope === lastScope && Date.now() - lastUpdate < (intervalMs + jitter)) return;
    loading = true;
    try {
      const success = await syncPortalRoster(portal, cache);
      if (success) {
        lastScope = scope;
        lastUpdate = Date.now();
      }
    } finally {
      loading = false;
    }
  };

  const initialTimer = setTimeout(() => void refresh(), 800 + Math.random() * 1500);
  const intervalId = setInterval(() => void refresh(), intervalMs + Math.random() * 60_000);
  const onOnline = () => {
    setTimeout(() => void refresh(), 1000 + Math.random() * 3000);
  };
  window.addEventListener('online', onOnline);

  return () => {
    clearTimeout(initialTimer);
    clearInterval(intervalId);
    window.removeEventListener('online', onOnline);
  };
}
