/** Generate RFC 4122 UUIDs on older secure browsers without crypto.randomUUID. */
export function newEventId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export type Direction = "CHECK_IN" | "CHECK_OUT";
export type Rules = {
  check_in_start: string;
  check_in_end: string;
  check_out_start: string;
  timezone: string;
  version?: string;
};
export type Student = {
  id: string;
  full_name: string;
  student_number: string;
  nisn?: string;
  class_name?: string;
  cards: {
    qr_key: string;
    card_uid: string;
    card_serial: string;
    expires_at?: string;
  }[];
};
export type Official = {
  student_id: string;
  direction: Direction;
  occurred_at: string;
  is_late: boolean;
  is_early_departure: boolean;
  notes?: string;
};
export type Snapshot = {
  scope: string;
  saved: number;
  server_time: string;
  clock_saved?: number;
  rules: Rules;
  students: Student[];
  today: Official[];
};
export type Scan = {
  event_id: string;
  device_id: string;
  identifier: string;
  direction: Direction;
  occurred_at: string;
  notes: string;
  scanner_name: string;
};
export type Record = Scan & {
  scope: string;
  daily: string;
  student_id: string;
  student_name: string;
  class_name?: string;
  status:
    | "PENDING"
    | "ACCEPTED"
    | "REPLACED"
    | "DUPLICATE"
    | "NEEDS_REASON"
    | "REJECTED";
  message?: string;
  is_late: boolean;
  is_early_departure: boolean;
  canonical?: Official;
};
export type Result = {
  event_id: string;
  status: Record["status"];
  code?: string;
  message?: string;
  canonical?: Official;
  is_late?: boolean;
  is_early_departure?: boolean;
};
let opened: Promise<IDBDatabase>;
function db() {
  return (opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("aksis-attendance-v2", 1);
    request.onupgradeneeded = () => {
      const events = request.result.createObjectStore("events", {
        keyPath: "event_id",
      });
      events.createIndex("scope", "scope");
      events.createIndex("daily", "daily");
      request.result.createObjectStore("snapshots", { keyPath: "scope" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
export async function snapshot(scope: string): Promise<Snapshot | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const r = database
      .transaction("snapshots")
      .objectStore("snapshots")
      .get(scope);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveSnapshot(value: Snapshot) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const t = database.transaction("snapshots", "readwrite");
    t.objectStore("snapshots").put(value);
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error);
  });
}
export async function records(scope: string): Promise<Record[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const r = database
      .transaction("events")
      .objectStore("events")
      .index("scope")
      .getAll(scope);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
/** Atomic duplicate detection includes simultaneous tabs. Never evict unsynced events. */
export async function enqueue(value: Record): Promise<boolean> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const t = database.transaction("events", "readwrite"),
      s = t.objectStore("events");
    let inserted = false;
    const r = s.index("daily").getAll(value.daily);
    r.onsuccess = () => {
      if (!(r.result as Record[]).some((v) => v.status !== "REJECTED")) {
        s.add(value);
        inserted = true;
      }
    };
    t.oncomplete = () => resolve(inserted);
    t.onabort = () => reject(t.error);
  });
}
/** Apply only acknowledged event IDs from this exact batch; never clear the queue. */
export async function acknowledge(
  scope: string,
  batch: Scan[],
  results: Result[],
) {
  const allowed = new Set(batch.map((v) => v.event_id)),
    database = await db();
  await new Promise<void>((resolve, reject) => {
    const t = database.transaction("events", "readwrite"),
      s = t.objectStore("events");
    for (const result of results)
      if (
        allowed.has(result.event_id) &&
        [
          "ACCEPTED",
          "REPLACED",
          "DUPLICATE",
          "NEEDS_REASON",
          "REJECTED",
        ].includes(result.status)
      ) {
        const r = s.get(result.event_id);
        r.onsuccess = () => {
          const old = r.result as Record | undefined;
          if (old?.scope === scope && old.status === "PENDING")
            s.put({
              ...old,
              status: result.status,
              message:
                result.message ??
                (result.status === "NEEDS_REASON"
                  ? "Lengkapi keterangan dengan waktu pemindaian semula."
                  : result.status === "REJECTED"
                    ? "Minta admin memeriksa data ini."
                    : undefined),
              canonical: result.canonical,
              is_late: result.is_late ?? old.is_late,
              is_early_departure:
                result.is_early_departure ?? old.is_early_departure,
            });
        };
      }
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error);
  });
}
export async function addReason(scope: string, id: string, notes: string) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const t = database.transaction("events", "readwrite"),
      s = t.objectStore("events"),
      r = s.get(id);
    r.onsuccess = () => {
      const old = r.result as Record;
      if (old?.scope === scope && old.status === "NEEDS_REASON")
        s.put({ ...old, notes, status: "PENDING" });
    };
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error);
  });
}
export function payload(v: Record): Scan {
  return {
    event_id: v.event_id,
    device_id: v.device_id,
    identifier: v.identifier,
    direction: v.direction,
    occurred_at: v.occurred_at,
    notes: v.notes,
    scanner_name: v.scanner_name,
  };
}
export function schoolTime(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (key: string) => parts.find((v) => v.type === key)!.value;
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}
export function compliance(direction: Direction, iso: string, rules: Rules) {
  const { time } = schoolTime(iso, rules.timezone);
  return {
    is_late: direction === "CHECK_IN" && time > rules.check_in_end,
    is_early_departure:
      direction === "CHECK_OUT" && time < rules.check_out_start,
  };
}
export function attendanceGreeting(
  studentName: string,
  direction: Direction,
  isLate: boolean,
): string {
  if (direction === "CHECK_OUT") {
    return `Sampai Jumpa besok ${studentName}. Hati-hati dijalan.`;
  }
  if (isLate) {
    return `Waduh kamu terlambat hari ini ${studentName}`;
  }
  return `Selamat Pagi ${studentName}`;
}
export function resolveStudent(
  list: Student[],
  identifier: string,
  at: string,
): Student | undefined {
  const raw = identifier.trim().toUpperCase();
  const found = list.filter(
    (s) =>
      [s.id, s.student_number, s.nisn].some((v) => v?.toUpperCase() === raw) ||
      s.cards.some(
        (c) =>
          (!c.expires_at || Date.parse(c.expires_at) > Date.parse(at)) &&
          [c.qr_key, c.card_uid, c.card_serial].some(
            (v) => v?.toUpperCase() === raw,
          ),
      ),
  );
  return found.length === 1 ? found[0] : undefined;
}
