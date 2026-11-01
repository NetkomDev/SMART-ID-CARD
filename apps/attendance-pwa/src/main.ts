import { QRCamera, bindLoginCamera } from "../../shared/qr-camera";
import { PortalError, PortalSession } from "../../shared/portal-session";
import {
  setupInstallPrompt,
  offerInstall,
  promptOrOfferInstall,
} from "../../shared/install-prompt";
import {
  acknowledge,
  newEventId,
  addReason,
  attendanceGreeting,
  compliance,
  enqueue,
  payload,
  records,
  resolveStudent,
  saveSnapshot,
  schoolTime,
  snapshot,
  type Direction,
  type Record as ScanRecord,
  type Result,
  type Snapshot,
  type Student,
} from "./store";
import { NaturalVoice } from "../../shared/natural-voice";
import "./style.css";

const portal = new PortalSession(
  "GATE_STAFF",
  import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
);
setupInstallPrompt(
  "Piket Kehadiran",
  import.meta.env.BASE_URL,
  import.meta.env.PROD,
);
const el = (id: string) => document.getElementById(id)!;
const input = (id: string) => el(id) as HTMLInputElement;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
let data: Snapshot | undefined,
  scope = "",
  direction: Direction = "CHECK_IN",
  busy = false,
  pending: ScanRecord | undefined,
  syncBusy = false,
  lastSync = 0,
  locked = false,
  manualDirection = false;
let calibratedAt = performance.now(),
  serverAt = Date.now(),
  wallAt = Date.now();
let history: ScanRecord[] = [];
let lastScannedId = "";
let directionDay = "";
let lastBind = 0,
  binding = false;
const deviceKey = "aksis.attendance.device.v2";
let deviceId = localStorage.getItem(deviceKey);
if (!deviceId) {
  deviceId = newEventId();
  localStorage.setItem(deviceKey, deviceId);
}
const nameKey = () => {
  const currentScope =
    scope ||
    (portal.context ? `${portal.context.school_id}:${portal.context.id}` : "");
  return currentScope
    ? `aksis.attendance.name.${currentScope}`
    : "aksis.attendance.name.default";
};
const name = () => localStorage.getItem(nameKey()) ?? "";
const now = () =>
  new Date(serverAt + performance.now() - calibratedAt).toISOString();
function calibrate(time: string) {
  serverAt = Date.parse(time);
  calibratedAt = performance.now();
  wallAt = Date.now();
}
function sameAccess() {
  const current = portal.context;
  return !!current && scope === `${current.school_id}:${current.id}`;
}
function usable() {
  return (
    !locked &&
    sameAccess() &&
    !!data &&
    Date.now() - data.saved >= -300000 &&
    Date.now() - data.saved < 7 * 86400000
  );
}
function feedback(type: string, title: string, message: string) {
  el("scan-feedback-banner").className = `scan-feedback-banner ${type}`;
  el("scan-feedback-banner").style.display = "flex";
  el("feedback-icon").textContent = type === "error" ? "!" : "✓";
  el("feedback-title").textContent = title;
  el("feedback-message").textContent = message;
}
let audio: AudioContext | undefined;
function beep() {
  try {
    audio ??= new AudioContext();
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    oscillator.connect(gain);
    gain.connect(audio.destination);
    gain.gain.setValueAtTime(0.1, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
    oscillator.frequency.value = 780;
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.12);
  } catch {
    /* Sound is optional. */
  }
}
const speaker = new NaturalVoice("attendance", ({ enabled, text, hasVoice }) => {
  const toggle = el("voice-toggle") as HTMLButtonElement | null;
  if (toggle) {
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.textContent = enabled ? "🔊 Aktif" : "🔇 Nonaktif";
  }
  const testBtn = el("voice-test") as HTMLButtonElement | null;
  if (testBtn) testBtn.disabled = !enabled;
  const statusEl = el("voice-status");
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.style.cursor = hasVoice ? "default" : "pointer";
    statusEl.title = hasVoice ? "" : "Ketuk untuk melihat panduan pemasangan suara Bahasa Indonesia";
  }
  const guideBtn = el("voice-guide-btn") as HTMLButtonElement | null;
  if (guideBtn) {
    guideBtn.style.display = (!hasVoice && enabled) ? "inline-flex" : "none";
  }
});
el("voice-toggle").onclick = () => speaker.setEnabled(!speaker.enabled);
el("voice-test").onclick = () => {
  speaker.unlock();
  if (!speaker.hasIndonesianVoice) {
    speaker.openGuide();
  } else {
    speaker.speak("Suara siap digunakan");
  }
};
el("voice-guide-btn")?.addEventListener("click", () => speaker.openGuide());
el("voice-status")?.addEventListener("click", () => {
  if (!speaker.hasIndonesianVoice) speaker.openGuide();
});
void speaker.prepare().catch(() => undefined);
const camera = new QRCamera({
  readerId: "qr-reader",
  toggleId: "btn-toggle-camera",
  stageId: "scanner-stage",
  placeholderId: "scanner-placeholder",
  statusId: "scan-status",
  zoomId: "zoom-controls",
  canRead: () =>
    usable() &&
    !busy &&
    !pending &&
    el("modal-scanner-name").style.display !== "flex",
  onDecode: (code) => scan(code),
});
bindLoginCamera(import.meta.env.BASE_URL);
el("btn-toggle-camera").onclick = () => {
  speaker.unlock();
  void (camera.active ? camera.stop() : camera.start());
};
el("btn-switch-camera").onclick = () => {
  void camera.flip();
};
document.querySelectorAll<HTMLButtonElement>(".zoom-btn").forEach(
  (button) =>
    (button.onclick = () => {
      void camera.setZoom(Number(button.dataset.zoom));
    }),
);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    speaker.stop();
    void camera.stop();
  } else void sync();
});
window.addEventListener("pagehide", () => {
  speaker.stop();
  void camera.stop();
});
function autoDetectDirection(): Direction {
  if (!data?.rules) return "CHECK_IN";
  const { time } = schoolTime(now(), data.rules.timezone);
  return time >= data.rules.check_out_start ? "CHECK_OUT" : "CHECK_IN";
}
function updateDirection(forceAuto = false) {
  if (data?.rules) {
    const day = schoolTime(now(), data.rules.timezone).day;
    if (directionDay && directionDay !== day) manualDirection = false;
    directionDay = day;
  }
  if (forceAuto || !manualDirection) {
    direction = autoDetectDirection();
  }
  renderDirection();
}
function renderDirection() {
  for (const [id, value] of [
    ["btn-dir-in", "CHECK_IN"],
    ["btn-dir-out", "CHECK_OUT"],
  ]) {
    el(id!).classList.toggle("active", direction === value);
    el(id!).setAttribute("aria-pressed", String(direction === value));
  }
}
el("btn-dir-in").onclick = () => {
  if (!pending) {
    manualDirection = true;
    direction = "CHECK_IN";
    renderDirection();
  }
};
el("btn-dir-out").onclick = () => {
  if (!pending) {
    manualDirection = true;
    direction = "CHECK_OUT";
    renderDirection();
  }
};
async function render() {
  if (!scope) return;
  history = (await records(scope)).sort((a, b) =>
    b.occurred_at.localeCompare(a.occurred_at),
  );
  const waiting = history.filter((v) => v.status === "PENDING").length,
    review = history.filter((v) =>
      ["REJECTED", "NEEDS_REASON"].includes(v.status),
    ).length;
  el("queue-badge").style.display = waiting || review ? "inline-block" : "none";
  el("queue-badge").textContent =
    `${waiting} antre${review ? ` · ${review} periksa` : ""}`;
  el("network-badge").textContent = navigator.onLine ? "● Online" : "● Offline";
  el("network-badge").className =
    `badge-status ${navigator.onLine ? "online" : "offline"}`;
  const nameDisplay = el("scanner-name-display");
  const nameTextEl =
    nameDisplay.querySelector<HTMLElement>(".teacher-name-text");
  const teacherName = name() || "Isi nama petugas";
  if (nameTextEl) nameTextEl.textContent = teacherName;
  else nameDisplay.textContent = teacherName;
  const day = data ? schoolTime(now(), data.rules.timezone).day : "";
  const visible = history.filter(
    (v) =>
      v.daily.includes(`:${day}:`) ||
      ["PENDING", "REJECTED", "NEEDS_REASON"].includes(v.status),
  );
  el("scan-count-badge").textContent = `${visible.length} pindai`;
  el("local-scan-list").innerHTML =
    visible
      .slice(0, 100)
      .map((original) => {
        const official = data!.today.find(
          (o) =>
            o.student_id === original.student_id &&
            o.direction === original.direction &&
            schoolTime(o.occurred_at, data!.rules.timezone).day ===
              schoolTime(original.occurred_at, data!.rules.timezone).day,
        );
        const v =
          official &&
          official.occurred_at < original.occurred_at &&
          !["PENDING", "REJECTED", "NEEDS_REASON"].includes(original.status)
            ? {
                ...original,
                status: "DUPLICATE" as const,
                canonical: official,
                is_late: official.is_late,
                is_early_departure: official.is_early_departure,
              }
            : original;
        const label = {
          PENDING: "Tersimpan di HP · menunggu sinkron",
          ACCEPTED: "Terkonfirmasi",
          REPLACED: "Terkonfirmasi · waktu paling awal",
          DUPLICATE: "Duplikat · waktu awal dipakai",
          NEEDS_REASON: "Perlu keterangan",
          REJECTED: "Perlu diperiksa admin",
        }[v.status];
        const time = schoolTime(
          v.canonical?.occurred_at ?? v.occurred_at,
          data!.rules.timezone,
        ).time;
        return `<li class="history-item"><div class="history-item-left"><strong>${escape(v.student_name)}</strong><small>${escape(v.class_name ?? "Siswa")} · ${v.direction === "CHECK_IN" ? "Datang" : "Pulang"}</small><small>${escape(label)}</small>${v.message ? `<small>${escape(v.message)}</small>` : ""}${v.status === "NEEDS_REASON" ? `<button type="button" data-reason="${v.event_id}">Isi keterangan</button>` : ""}</div><div class="history-item-right"><b>${time}</b><small>${v.is_late ? "Terlambat" : v.is_early_departure ? "Pulang cepat" : ""}</small></div></li>`;
      })
      .join("") ||
    '<li class="empty-history">Belum ada pemindaian hari ini.</li>';
  el("local-scan-list")
    .querySelectorAll<HTMLButtonElement>("[data-reason]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          const v = history.find((v) => v.event_id === b.dataset.reason);
          if (v) reason(v);
        }),
    );
  if (data) {
    el("offline-status").textContent = usable()
      ? `${data.students.length} siswa tersedia di HP · data ${new Date(data.saved).toLocaleString("id-ID", { timeZone: data.rules.timezone })}`
      : "Data offline kedaluwarsa. Perbarui saat online.";
    el("hint-dir-in").textContent =
      `${data.rules.check_in_start}–${data.rules.check_in_end}`;
    el("hint-dir-out").textContent = `Mulai ${data.rules.check_out_start}`;
  }
}
const LATE_CHIPS = [
  "Macet di jalan",
  "Ban bocor / kendaraan rusak",
  "Hujan lebat / cuaca buruk",
  "Bangun kesiangan",
  "Keperluan keluarga",
  "Sakit di jalan",
];
const EARLY_CHIPS = [
  "Sakit di sekolah (UKS)",
  "Izin keperluan keluarga mendesak",
  "Dispensasi kegiatan lomba / dinas",
  "Jemputan orang tua datang lebih awal",
];

function reason(value: ScanRecord) {
  pending = value;
  el("reason-modal-title").textContent = value.is_late
    ? "Siswa Terlambat"
    : "Pulang Lebih Cepat";
  el("reason-modal-desc").textContent = value.is_late
    ? `Siswa datang melewati batas jam kehadiran (${data?.rules.check_in_end ?? "07:15"}). Masukkan alasan / keterangan terlambat:`
    : `Siswa pulang sebelum jam kepulangan resmi (${data?.rules.check_out_start ?? "14:30"}). Masukkan alasan pulang cepat:`;
  el("reason-student-name").textContent = value.student_name;
  el("reason-student-class").textContent = value.class_name ?? "";
  input("reason-input-text").value = value.notes;

  const chipsWrap = el("quick-chips-container");
  chipsWrap.innerHTML = "";
  const chips = value.is_late ? LATE_CHIPS : EARLY_CHIPS;
  chips.forEach((text) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip-btn";
    chip.textContent = text;
    chip.onclick = () => {
      input("reason-input-text").value = text;
      input("reason-input-text").focus();
      chipsWrap
        .querySelectorAll(".chip-btn")
        .forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
    };
    chipsWrap.appendChild(chip);
  });

  el("modal-reason").style.display = "flex";
  input("reason-input-text").focus();
}
function showOutOfHours(student: Student, message: string) {
  el("out-of-hours-title").textContent = "Bukan Waktu Sekolah";
  el("out-of-hours-desc").textContent = message;
  el("out-of-hours-student-name").textContent = student.full_name;
  el("out-of-hours-student-class").textContent = student.class_name ?? "";
  el("modal-out-of-hours").style.display = "flex";
}
el("btn-close-out-of-hours").onclick = () => {
  el("modal-out-of-hours").style.display = "none";
};
el("btn-skip-reason").onclick = () => {
  pending = undefined;
  el("modal-reason").style.display = "none";
};
el("form-reason").onsubmit = async (e) => {
  e.preventDefault();
  if (!pending || !input("reason-input-text").value.trim() || busy) return;
  busy = true;
  const v = pending;
  try {
    v.notes = input("reason-input-text").value.trim();
    if (v.status === "NEEDS_REASON")
      await addReason(scope, v.event_id, v.notes);
    else await persist(v);
    pending = undefined;
    el("modal-reason").style.display = "none";
    await render();
    void sync();
  } catch {
    feedback(
      "error",
      "Belum tersimpan",
      "Penyimpanan HP tidak tersedia. Jangan tutup halaman; coba kembali.",
    );
  } finally {
    busy = false;
  }
};
function editName() {
  input("input-scanner-name").value = name();
  el("modal-scanner-name").style.display = "flex";
  input("input-scanner-name").focus();
}
el("scanner-name-display").onclick = editName;
el("scanner-name-display").onkeydown = (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    editName();
  }
};
el("btn-close-scanner-name").onclick = () => {
  el("modal-scanner-name").style.display = "none";
};
el("form-scanner-name").onsubmit = async (e) => {
  e.preventDefault();
  const value = input("input-scanner-name").value.trim();
  if (!scope && portal.context) {
    scope = `${portal.context.school_id}:${portal.context.id}`;
  }
  if (!value) return;

  // 1. Simpan identitas nama guru lokal & perbarui tampilan
  localStorage.setItem(nameKey(), value);
  el("modal-scanner-name").style.display = "none";
  void render();

  // Registration is retried in the background after connectivity returns.
  bindDevice(true);

  // 3. Picu instalasi PWA ke layar HP pengguna
  await promptOrOfferInstall();
};
async function attendanceRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  try {
    return await portal.request<T>(path, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}
function bindDevice(force = false) {
  if (
    !navigator.onLine ||
    !sameAccess() ||
    !deviceId ||
    !name() ||
    binding ||
    (!force && Date.now() - lastBind < 60000)
  )
    return;
  binding = true;
  lastBind = Date.now();
  void attendanceRequest("/attendance/register-device", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, scanner_name: name() }),
  })
    .catch((error) => {
      if (error instanceof PortalError && [401, 403].includes(error.status)) {
        locked = true;
        void camera.stop();
        feedback(
          "error",
          "Akses tidak aktif",
          "Hubungi admin sekolah. Antrean tetap tersimpan.",
        );
      }
    })
    .finally(() => {
      binding = false;
    });
}
async function persist(value: ScanRecord) {
  lastScannedId = value.event_id;
  if (!(await enqueue(value))) {
    feedback(
      "duplicate",
      "Kehadiran sudah tercatat di HP ini",
      "Pemindaian sebelumnya tetap digunakan.",
    );
    return;
  }
  if (!speaker.available) beep();
  feedback(
    "success",
    "Tersimpan di HP",
    `${value.student_name} · sinkronisasi berjalan di latar belakang.`,
  );
  await render();
  void sync();
}
async function scan(raw: string) {
  if (busy || pending) return;
  busy = true;
  try {
    if (!usable())
      throw new Error(
        "Hubungkan internet untuk memperbarui akses dan data sekolah (berlaku offline 7 hari).",
      );
    if (!name()) {
      editName();
      return;
    }
    if (
      Math.abs(Date.now() - wallAt - (performance.now() - calibratedAt)) >
      300000
    )
      throw new Error(
        "Jam HP berubah. Hubungkan internet dan muat ulang untuk menyamakan waktu.",
      );
    updateDirection();
    const time = now(),
      student = resolveStudent(data!.students, raw, time);
    if (!student)
      throw new Error(
        "QR/NISN tidak ditemukan pada data sekolah di HP ini. Perbarui data saat online atau periksa kartu siswa.",
      );
    const comp = compliance(direction, time, data!.rules);
    speaker.speak(attendanceGreeting(student.full_name, direction, comp.is_late));
    const { day } = schoolTime(time, data!.rules.timezone);

    const local = (await records(scope)).find(
      (v) =>
        v.student_id === student.id &&
        v.direction === direction &&
        v.daily === `${scope}:${day}:${student.id}:${direction}` &&
        v.status !== "REJECTED",
    );
    if (local?.status === "NEEDS_REASON") {
      reason(local);
      return;
    }
    if (local) {
      feedback(
        "duplicate",
        "Kehadiran sudah tercatat di HP ini",
        `${student.full_name} · ${local.status === "PENDING" ? "menunggu sinkronisasi" : "pemindaian pertama tetap digunakan"}`,
      );
      return;
    }
    const existing = data!.today.find(
      (v) =>
        v.student_id === student.id &&
        v.direction === direction &&
        schoolTime(v.occurred_at, data!.rules.timezone).day === day,
    );
    if (existing && existing.occurred_at <= time) {
      feedback(
        "duplicate",
        "Kehadiran sudah tercatat hari ini",
        `${student.full_name} · ${schoolTime(existing.occurred_at, data!.rules.timezone).time}`,
      );
      return;
    }
    const value: ScanRecord = {
      event_id: newEventId(),
      device_id: deviceId!,
      identifier: raw.trim(),
      direction,
      occurred_at: time,
      scanner_name: name(),
      notes: "",
      scope,
      daily: `${scope}:${day}:${student.id}:${direction}`,
      student_id: student.id,
      student_name: student.full_name,
      class_name: student.class_name,
      status: "PENDING",
      ...comp,
    };
    if (value.is_late || value.is_early_departure) reason(value);
    else await persist(value);
  } catch (error) {
    feedback(
      "error",
      "Belum dicatat",
      error instanceof Error ? error.message : "Penyimpanan HP tidak tersedia.",
    );
  } finally {
    busy = false;
  }
}
el("form-scan").onsubmit = (e) => {
  e.preventDefault();
  speaker.unlock();
  void scan(input("scan-input").value);
  input("scan-input").value = "";
};
async function sync() {
  if (
    !sameAccess() ||
    syncBusy ||
    locked ||
    !scope ||
    !navigator.onLine ||
    Date.now() - lastSync < 8000
  )
    return;
  const activeScope = scope;
  syncBusy = true;
  lastSync = Date.now();
  try {
    const batch = (await records(activeScope))
      .filter((v) => v.status === "PENDING")
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .slice(0, 25)
      .map(payload);
    if (!batch.length || !sameAccess()) return;
    const response = await attendanceRequest<{
      results: Result[];
      server_time: string;
    }>("/attendance/pwa-sync", {
      method: "POST",
      body: JSON.stringify({ scans: batch }),
    });
    await acknowledge(activeScope, batch, response.results);
    if (scope === activeScope && data) {
      // Refresh canonical knowledge without discarding any queued earlier scans.
      for (const r of response.results)
        if (r.canonical) {
          const c = r.canonical;
          data.today = data.today.filter(
            (v) =>
              !(
                v.student_id === c.student_id &&
                v.direction === c.direction &&
                schoolTime(v.occurred_at, data!.rules.timezone).day ===
                  schoolTime(c.occurred_at, data!.rules.timezone).day
              ),
          );
          data.today.push(c);
        }
      const duplicate = response.results.find(
        (r) => r.event_id === lastScannedId && r.status === "DUPLICATE",
      );
      if (duplicate?.canonical)
        feedback(
          "duplicate",
          "Kehadiran sudah tercatat hari ini",
          `Pemindaian pertama pukul ${schoolTime(duplicate.canonical.occurred_at, data.rules.timezone).time} tetap digunakan.`,
        );
      await render();
    }
  } catch (error) {
    if (error instanceof PortalError && [401, 403].includes(error.status)) {
      locked = true;
      void camera.stop();
      feedback(
        "error",
        "Akses perlu diperbarui",
        "Antrean tetap tersimpan. Pindai kembali QR akses dari admin sekolah.",
      );
    }
    // Network errors leave every event intact and do not interrupt scanning.
  } finally {
    syncBusy = false;
  }
}
async function refreshData() {
  if (!navigator.onLine || !scope || locked || !sameAccess()) return;
  const originalScope = scope;
  try {
    let firstReceived = performance.now();
    let after: string | null = null,
      students: Student[] = [],
      first:
        | {
            rules: Snapshot["rules"];
            server_time: string;
            today: Snapshot["today"];
          }
        | undefined;
    do {
      const page: {
        school_id: string;
        students: Student[];
        next_cursor: string | null;
        rules: Snapshot["rules"];
        server_time: string;
        today: Snapshot["today"];
      } = await attendanceRequest(
        `/attendance/bootstrap${after ? `?after=${after}` : ""}`,
      );
      if (
        originalScope !== scope ||
        page.school_id !== portal.context?.school_id
      )
        return;
      if (!first) {
        first = page;
        firstReceived = performance.now();
      }
      students.push(...page.students);
      after = page.next_cursor;
    } while (after);
    const value: Snapshot = {
      scope,
      saved: Date.now(),
      server_time: new Date(
        Date.parse(first!.server_time) + performance.now() - firstReceived,
      ).toISOString(),
      rules: first!.rules,
      students,
      today: first!.today,
    };
    await saveSnapshot(value);
    data = value;
    calibrate(value.server_time);
    await render();
  } catch (error) {
    if (error instanceof PortalError && [401, 403].includes(error.status)) {
      locked = true;
      void camera.stop();
      feedback(
        "error",
        "Akses tidak aktif",
        "Hubungi admin sekolah. Antrean tetap tersimpan.",
      );
    } else if (!data) throw error;
  }
}
async function refreshState() {
  if (!navigator.onLine || !scope || locked || !sameAccess()) return;
  if (
    !data ||
    Date.now() < data.saved ||
    Date.now() - data.saved > 15 * 60000
  ) {
    await refreshData();
    return;
  }
  const originalScope = scope;
  try {
    const state = await attendanceRequest<{
      school_id: string;
      server_time: string;
      rules: Snapshot["rules"];
      today: Snapshot["today"];
    }>("/attendance/state");
    if (
      originalScope !== scope ||
      state.school_id !== portal.context?.school_id
    )
      return;
    data = { ...data, ...state, clock_saved: Date.now() };
    await saveSnapshot(data);
    calibrate(state.server_time);
    await render();
  } catch (error) {
    if (error instanceof PortalError && [401, 403].includes(error.status)) {
      locked = true;
      void camera.stop();
      feedback(
        "error",
        "Akses tidak aktif",
        "Hubungi admin sekolah. Antrean tetap tersimpan.",
      );
    }
  }
}
async function start() {
  try {
    const incoming = /(?:[?#&])token=/.test(location.href);
    // An existing validated snapshot opens immediately even when Wi-Fi has no internet.
    const cachedContext = portal.context;
    let warm = false;
    if (!incoming && cachedContext) {
      scope = `${cachedContext.school_id}:${cachedContext.id}`;
      data = await snapshot(scope);
      warm = usable();
    }
    if (navigator.onLine || incoming) {
      if (warm && !incoming) {
        void portal
          .start()
          .then((active) => {
            if (!active || !sameAccess())
              throw new PortalError("Akses berubah", 403, "PORTAL_MISMATCH");
          })
          .catch((error) => {
            if (
              error instanceof PortalError &&
              [401, 403].includes(error.status)
            ) {
              locked = true;
              void camera.stop();
              feedback(
                "error",
                "Akses tidak aktif",
                "Hubungi admin sekolah. Antrean tetap tersimpan.",
              );
            }
          });
      } else {
        try {
          if (!(await portal.start())) {
            el("view-login").style.display = "block";
            return;
          }
        } catch (error) {
          if (
            incoming ||
            !portal.context ||
            (error instanceof PortalError && [401, 403].includes(error.status))
          )
            throw error;
        }
      }
    }
    if (!portal.context) {
      el("view-login").style.display = "block";
      return;
    }
    scope = `${portal.context.school_id}:${portal.context.id}`;
    const scopedDeviceKey = `${deviceKey}.${scope}`;
    deviceId = localStorage.getItem(scopedDeviceKey) || newEventId();
    localStorage.setItem(scopedDeviceKey, deviceId);
    data = await snapshot(scope);
    if (data) {
      calibrate(
        new Date(
          Date.now() +
            Date.parse(data.server_time) -
            (data.clock_saved ?? data.saved),
        ).toISOString(),
      );
    }
    if (data && usable()) {
      // Instantly open scanner view from previously cached snapshot
      el("view-login").style.display = "none";
      el("view-scan").style.display = "block";
      el("workspace-nav").hidden = false;
      el("school-name").textContent = portal.context.school_name;
      updateDirection();
      await render();
      if (!name()) {
        editName();
      } else {
        offerInstall();
      }
      // Force background update if online without blocking scanner
      if (navigator.onLine) {
        void refreshState().catch((err) =>
          console.warn("Background refresh state error:", err),
        );
      }
    } else {
      // First time on this device or expired snapshot: fetch initial data
      await refreshState();
      el("view-login").style.display = "none";
      el("view-scan").style.display = "block";
      el("workspace-nav").hidden = false;
      el("school-name").textContent = portal.context.school_name;
      if (!usable())
        feedback(
          "error",
          "Persiapan offline belum siap",
          "Hubungkan internet untuk mengunduh data siswa dan jam sekolah.",
        );
      updateDirection();
      await render();
      if (!name()) {
        editName();
      } else {
        offerInstall();
      }
    }
    if (localStorage.getItem("aksis_attendance_queue_v1"))
      feedback(
        "warning",
        "Antrean versi lama ditemukan",
        "Antrean lama tetap disimpan di HP ini. Hubungi admin agar dapat diperiksa.",
      );
    bindDevice();
    void sync();
  } catch (error) {
    el("view-login").style.display = "block";
    el("login-error").textContent =
      error instanceof Error ? error.message : "Tidak dapat membuka portal.";
  }
}
el("form-login").onsubmit = (e) => {
  e.preventDefault();
  void start();
};
el("btn-login-retry").style.display = "inline-block";
el("btn-refresh-data").onclick = () => {
  if (!navigator.onLine) {
    feedback(
      "warning",
      "Data belum diperbarui",
      "Hubungkan internet untuk memperbarui data siswa.",
    );
    return;
  }
  const previous = data?.saved;
  void refreshData()
    .then(() => {
      if (!data || data.saved === previous)
        throw new Error("Data belum diperbarui");
      feedback(
        "success",
        "Data diperbarui",
        "Daftar siswa dan jam sekolah tersedia di HP ini.",
      );
    })
    .catch(() =>
      feedback(
        "error",
        "Data belum diperbarui",
        "Periksa koneksi dan coba kembali.",
      ),
    );
};
window.addEventListener("online", () => {
  bindDevice(true);
  void sync();
  void refreshState();
});
window.addEventListener("offline", () => {
  void render();
});
// Background batches use the same stable event IDs and retry without blocking the scanner.
const SYNC_INTERVAL_MS = 8500;
setInterval(() => {
  void sync();
}, SYNC_INTERVAL_MS);
setInterval(() => {
  bindDevice();
  void refreshState();
}, 60000);
setInterval(() => {
  updateDirection();
}, 30000);
void start();

window.addEventListener("storage", (event) => {
  if (event.key === "aksis.portal.GATE_STAFF.v1" && scope && !sameAccess()) {
    locked = true;
    void camera.stop();
    feedback(
      "error",
      "Akses berubah",
      "Muat ulang portal. Antrean tetap tersimpan pada sekolah dan akses semula.",
    );
  }
});
