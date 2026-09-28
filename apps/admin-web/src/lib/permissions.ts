export const routePermissions: Record<string, string | undefined> = {
  "/": "dashboard.read",
  "/students": "student.read",
  "/student-import": "student.create",
  "/classes": undefined,
  "/academic-years": "academic.manage",
  "/attendance": "attendance.read",
  "/cards": "card.read",
  "/devices": "device.read",
  "/waste": "waste.manage",
  "/library": "library.manage",
  "/extracurricular": "extracurricular.manage",
  "/led": "led.manage",
  "/reports": "report.read"
};

/** Routes that require the SUPER_ADMIN role (not just permissions). */
export function isPlatformRoute(path: string): boolean {
  return path.startsWith("/platform");
}

export function canAccess(path: string, permissions: string[], roles: string[] = []): boolean {
  if (roles.includes("SUPER_ADMIN")) return isPlatformRoute(path);
  if (path === "/pwa-portals") return roles.includes("SCHOOL_ADMIN");
  // Platform routes are exclusively for SUPER_ADMIN
  if (isPlatformRoute(path)) {
    return roles.includes("SUPER_ADMIN");
  }
  // School administrators remain within school operational routes
  if (roles.includes("SCHOOL_ADMIN")) {
    return true;
  }
  const required = routePermissions[path];
  return !required || permissions.includes(required);
}
