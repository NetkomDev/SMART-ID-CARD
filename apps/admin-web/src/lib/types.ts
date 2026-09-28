export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
};

export type School = { id: string; code: string; name: string; timezone?: string; is_active?: boolean };
export type AuthContext = { school_id: string; membership_id: string; roles: string[]; permissions: string[] };
export type ApiEnvelope<T> = { success: true; data: T; meta?: { page: number; page_size: number; total: number } };
export type ApiFailure = { success: false; error: { code: string; message: string; details?: unknown }; request_id: string };

export type Student = {
  id: string; student_number: string; nisn?: string | null; full_name: string;
  gender: string; date_of_birth?: string | null; is_active: boolean;
};
export type SchoolClass = { id: string; code: string; name: string; grade_level?: number | null; is_active: boolean };
export type Card = { id: string; card_serial: string; card_uid: string; student_id: string; status: string; expires_at?: string | null; students?: unknown };
export type Device = { id: string; device_code: string; device_type: string; name: string; location?: string | null; status: string; last_seen_at?: string | null; firmware_version?: string | null; online?: boolean };
export type Attendance = {
  id: string; direction: "CHECK_IN" | "CHECK_OUT"; is_late: boolean; occurred_at_local: string;
  students?: { full_name: string; student_number: string } | null;
  classes?: { name: string } | null;
  devices?: { name: string; device_code: string } | null;
};
export type AcademicYear = { id: string; name: string; start_date: string; end_date: string; is_active: boolean };
export type Extracurricular = { id: string; code: string; name: string; description: string | null; is_active: boolean };
export type LedContent = { id: string; title: string; body: string; priority: number; is_active: boolean; starts_at: string; ends_at: string };
