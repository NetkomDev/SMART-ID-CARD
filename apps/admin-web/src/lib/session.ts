import type { Session } from "./types";

const SESSION_KEY = "aksis.admin.session";
const SCHOOL_KEY = "aksis.admin.school";

export function getSession(): Session | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as Session; } catch { clearSession(); return null; }
}

export function setSession(session: Session): void { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
export function getSchoolId(): string | null { return sessionStorage.getItem(SCHOOL_KEY); }
export function setSchoolId(id: string): void { sessionStorage.setItem(SCHOOL_KEY, id); }
export function clearSession(): void { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SCHOOL_KEY); }
