import type { PostgrestError } from "@supabase/supabase-js";

export type ErrorCode =
  // Phase 03: authentication, tenant context, and core resources.
  | "PORTAL_NOT_CONFIGURED"
  | "PORTAL_CREATE_FAILED"
  | "PORTAL_ACCESS_INVALID"
  | "AUTH_REQUIRED"
  | "AUTH_INVALID"
  | "INVALID_CREDENTIALS"
  | "SESSION_REFRESH_FAILED"
  | "FORBIDDEN"
  | "TENANT_REQUIRED"
  | "SCHOOL_NOT_FOUND"
  | "CLASS_NOT_FOUND"
  | "STUDENT_NOT_FOUND"
  // Phase 04: academic lifecycle and card management.
  | "ACADEMIC_YEAR_NOT_FOUND"
  | "CARD_NOT_FOUND"
  // Phase 05: device provisioning and runtime authentication.
  | "DEVICE_NOT_REGISTERED"
  | "DEVICE_AUTH_INVALID"
  // Phase 06: gate eligibility, card/student state, and rule validation.
  | "DEVICE_NOT_GATE"
  | "ATTENDANCE_DISABLED"
  | "CARD_BLOCKED"
  | "STUDENT_INACTIVE"
  | "GATE_RULE_VIOLATION"
  | "PARENT_LINK_INVALID"
  | "CHILD_NOT_LINKED"
  | "EXTRACURRICULAR_MEMBER_REQUIRED"
  | "RESOURCE_NOT_FOUND"
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "ROUTE_NOT_FOUND"
  | "DATABASE_ERROR"
  | "DATABASE_NOT_READY"
  | "SERVER_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

import * as fs from "node:fs";

export function fromDatabaseError(error: PostgrestError): ApiError {
  try {
    fs.appendFileSync(process.cwd() + "/db_error.log", new Date().toISOString() + " DB Error: " + JSON.stringify(error) + "\n");
  } catch (e) {}

  const detailsStr = [error.message, error.details, error.hint].filter(Boolean).join(" | ");
  const lower = detailsStr.toLowerCase();

  if (error.code === "PGRST202" && error.message.includes("is_platform_admin")) {
    return new ApiError(503, "DATABASE_NOT_READY", "Konfigurasi database Super Admin belum siap. Pengelola perlu menerapkan migrasi Super Admin dan memperbarui cache API database.");
  }

  if (error.code === "28000") {
    return new ApiError(401, "DEVICE_AUTH_INVALID", "Kredensial perangkat tidak valid atau telah kadaluwarsa.");
  }
  if (error.code === "P0002") {
    return new ApiError(404, "RESOURCE_NOT_FOUND", "Data atau referensi yang dituju tidak ditemukan di database.");
  }
  if (error.code === "AG002") {
    return new ApiError(403, "DEVICE_NOT_GATE", "Perangkat tidak terdaftar untuk absensi gerbang.");
  }
  if (error.code === "AG003") {
    return new ApiError(403, "ATTENDANCE_DISABLED", "Absensi gerbang sedang dinonaktifkan untuk perangkat ini.");
  }
  if (error.code === "AG004") {
    return new ApiError(404, "CARD_NOT_FOUND", "Kartu siswa tidak ditemukan di sekolah ini.");
  }
  if (error.code === "AG005") {
    return new ApiError(422, "CARD_BLOCKED", "Kartu terblokir, tidak aktif, atau kadaluwarsa.");
  }
  if (error.code === "AG006") {
    return new ApiError(422, "STUDENT_INACTIVE", "Status siswa sedang tidak aktif.");
  }
  if (error.code === "AG007") {
    return new ApiError(422, "GATE_RULE_VIOLATION", "Transaksi absensi melanggar aturan gerbang.");
  }
  if (error.code === "42501") {
    return new ApiError(403, "FORBIDDEN", error.message || "Akses ditolak oleh kebijakan keamanan database. Pastikan akun Anda memiliki izin akses yang sesuai.");
  }
  if (error.code === "23505") {
    let friendlyMessage = "Gagal menyimpan: Data yang dimasukkan sudah terdaftar di database (duplikat).";
    if (lower.includes("nisn")) {
      friendlyMessage = "Gagal menyimpan: NISN ini sudah terdaftar untuk siswa lain di sekolah Anda. Periksa kembali file impor Anda.";
    } else if (lower.includes("student_number")) {
      friendlyMessage = "Gagal menyimpan: Nomor Induk Siswa (NIS) ini sudah terdaftar untuk siswa lain.";
    } else if (lower.includes("code")) {
      friendlyMessage = "Gagal menyimpan: Kode unik ini sudah terdaftar di database.";
    }
    return new ApiError(409, "CONFLICT", friendlyMessage, { postgrest: error });
  }
  if (error.code === "23503") {
    let friendlyMessage = "Gagal menyimpan: Data merujuk pada referensi yang tidak ditemukan.";
    if (lower.includes("class_id") || lower.includes("classes")) {
      friendlyMessage = "Gagal menyimpan: Kelas tujuan tidak ditemukan di database sekolah.";
    } else if (lower.includes("academic_year_id") || lower.includes("academic_years")) {
      friendlyMessage = "Gagal menyimpan: Tahun ajaran aktif tidak ditemukan untuk sekolah ini.";
    }
    return new ApiError(422, "VALIDATION_ERROR", friendlyMessage, { postgrest: error });
  }
  if (error.code === "23514") {
    let friendlyMessage = "Gagal menyimpan: Format atau isi data melanggar aturan constraint database.";
    if (lower.includes("students_nisn_format")) {
      friendlyMessage = "Gagal menyimpan: Format NISN tidak valid (harus berupa angka 4–20 digit).";
    } else if (lower.includes("students_birth_not_future")) {
      friendlyMessage = "Gagal menyimpan: Tanggal lahir siswa tidak boleh di masa depan.";
    } else if (lower.includes("students_text_not_blank")) {
      friendlyMessage = "Gagal menyimpan: Nama siswa dan NIS/Nomor Induk wajib diisi (tidak boleh kosong atau spasi).";
    }
    return new ApiError(422, "VALIDATION_ERROR", friendlyMessage, { postgrest: error });
  }
  if (error.code === "22023" || error.code === "P0001") {
    return new ApiError(422, "VALIDATION_ERROR", error.message || "Data input tidak valid.");
  }
  // Hide raw technical errors from the end user, but provide a friendly generic message
  return new ApiError(500, "DATABASE_ERROR", "Terjadi kendala pada sistem. Mohon coba beberapa saat lagi atau hubungi admin sekolah.");
}
