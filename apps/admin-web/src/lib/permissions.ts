export const routePermissions: Record<string, string | undefined> = {
  "/students": "student.read",
  "/student-import": "student.create",
  "/classes": undefined,
  "/attendance": "attendance.read",
  "/cards": "card.read",
  "/devices": "device.read"
};

export function canAccess(path: string, permissions: string[]): boolean {
  const required = routePermissions[path];
  return !required || permissions.includes(required);
}
