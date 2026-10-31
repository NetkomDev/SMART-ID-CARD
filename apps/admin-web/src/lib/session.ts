import type { Session } from "./types";

const SESSION_KEY = "aksis.admin.session";
const SCHOOL_KEY = "aksis.admin.school";

export function getSession(): Session | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    clearSession();
    return null;
  }
}

let revision = 0;
export function getSessionRevision(): number {
  return revision;
}
export function setSession(session: Session, refresh = false): void {
  if (!refresh) revision++;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
export function getSchoolId(): string | null {
  return sessionStorage.getItem(SCHOOL_KEY);
}
export function setSchoolId(id: string): void {
  if (getSchoolId() !== id) revision++;
  sessionStorage.setItem(SCHOOL_KEY, id);
}
export function clearSession(): void {
  revision++;
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SCHOOL_KEY);
}
