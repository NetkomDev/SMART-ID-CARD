const shapes: Record<string, string> = {
  "/": '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  "/academic-years":
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h3"/>',
  "/students":
    '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-2-4"/>',
  "/devices":
    '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10 17h4m-4-9 2-2 2 2m-2-2v7"/>',
  "/cards":
    '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16h6m4-6h4m-4 4h4"/>',
  "/pwa-portals":
    '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m12-6v6h-6"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  "/school-hours": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  "/attendance": '<path d="m8 12 3 3 5-6"/><circle cx="12" cy="12" r="9"/>',
  "/reports":
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 17v-3m4 3v-6m4 6v-4"/>',
  "/waste":
    '<path d="m9 5 3-3 4 7m-4-7 5 1M7 9l-4 7h8m-8 0 2 5m11-9 5 8h-8m8 0-1-5"/>',
  "/library":
    '<path d="M12 5v16M12 5C9 2 5 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-3-1-7-2-10 1Z"/>',
  "/extracurricular": '<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
  "/led":
    '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4M6 8h3m3 0h6M6 12h6m3 0h3"/>',
};
const platformIcons: Record<string, string> = {
  "/platform": "/",
  "/platform-schools": "/students",
  "/platform-iam": "/pwa-portals",
  "/platform-devices": "/devices",
  "/platform-card-templates": "/cards",
  "/platform-card-jobs": "/cards",
  "/platform-audit": "/reports",
};
export function menuIcon(route: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[platformIcons[route] ?? route] ?? shapes["/reports"]}</svg>`;
}
export function bindNavigation(
  sidebar: HTMLElement,
  toggle: HTMLButtonElement,
  scrim: HTMLElement,
): () => void {
  const mobile = matchMedia("(max-width: 760px)");
  let pinned = false;
  let hover = false;
  const sync = () => {
    const expanded = mobile.matches
      ? document.body.classList.contains("nav-open")
      : pinned || hover || sidebar.classList.contains("keyboard-open");
    sidebar.classList.toggle("expanded", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute(
      "aria-label",
      expanded ? "Tutup navigasi" : "Buka navigasi",
    );
    sidebar.inert = mobile.matches && !expanded;
  };
  const close = () => {
    document.body.classList.remove("nav-open");
    pinned = false;
    hover = false;
    sidebar.classList.remove("keyboard-open");
    sync();
  };
  const click = () => {
    if (mobile.matches) document.body.classList.toggle("nav-open");
    else pinned = !pinned;
    sync();
    if (mobile.matches && document.body.classList.contains("nav-open"))
      sidebar.querySelector<HTMLElement>("a")?.focus();
  };
  const enter = () => {
    if (matchMedia("(hover: hover)").matches) {
      hover = true;
      sync();
    }
  };
  const leave = () => {
    hover = false;
    sync();
  };
  const focus = () => {
    if (sidebar.querySelector(":focus-visible"))
      sidebar.classList.add("keyboard-open");
    sync();
  };
  const blur = (e: FocusEvent) => {
    if (!sidebar.contains(e.relatedTarget as Node)) {
      sidebar.classList.remove("keyboard-open");
      sync();
    }
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape" && sidebar.classList.contains("expanded")) {
      close();
      toggle.focus();
    }
    if (
      e.key === "Tab" &&
      mobile.matches &&
      document.body.classList.contains("nav-open")
    ) {
      const links = [
        toggle,
        ...sidebar.querySelectorAll<HTMLElement>("a,button"),
      ];
      const current = links.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      links[
        (current + (e.shiftKey ? -1 : 1) + links.length) % links.length
      ]!.focus();
    }
  };
  const change = () => close();
  toggle.addEventListener("click", click);
  scrim.addEventListener("click", close);
  sidebar.addEventListener("pointerenter", enter);
  sidebar.addEventListener("pointerleave", leave);
  sidebar.addEventListener("focusin", focus);
  sidebar.addEventListener("focusout", blur);
  document.addEventListener("keydown", key);
  if (typeof mobile.addEventListener === "function")
    mobile.addEventListener("change", change);
  else mobile.addListener(change);
  close();
  return () => {
    toggle.removeEventListener("click", click);
    scrim.removeEventListener("click", close);
    sidebar.removeEventListener("pointerenter", enter);
    sidebar.removeEventListener("pointerleave", leave);
    sidebar.removeEventListener("focusin", focus);
    sidebar.removeEventListener("focusout", blur);
    document.removeEventListener("keydown", key);
    if (typeof mobile.removeEventListener === "function")
      mobile.removeEventListener("change", change);
    else mobile.removeListener(change);
    document.body.classList.remove("nav-open");
  };
}
