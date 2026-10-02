/**
 * Lightweight, dependency-free toast notification system.
 * Supports success, error, info, and warning variants.
 * Auto-dismisses and stacks multiple toasts.
 */

export type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  duration?: number; // ms, default 3500
  action?: { label: string; onClick: () => void }; // e.g. "Undo"
}

let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (container && container.isConnected) return container;
  container = document.createElement("div");
  container.id = "aksis-toast-container";
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-atomic", "false");
  document.body.appendChild(container);
  return container;
}

const icons: Record<ToastVariant, string> = {
  success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

export function toast(options: ToastOptions): void;
export function toast(message: string, variant?: ToastVariant): void;
export function toast(
  messageOrOptions: string | ToastOptions,
  variantArg?: ToastVariant
): void {
  const opts: ToastOptions =
    typeof messageOrOptions === "string"
      ? { message: messageOrOptions, variant: variantArg }
      : messageOrOptions;
  const { message, variant = "info", duration = 3500, action } = opts;

  const wrapper = ensureContainer();
  const el = document.createElement("div");
  el.className = `aksis-toast aksis-toast--${variant}`;
  el.setAttribute("role", variant === "error" ? "alert" : "status");

  let actionHtml = "";
  if (action) {
    actionHtml = `<button class="aksis-toast__action" type="button">${escapeHtml(action.label)}</button>`;
  }

  el.innerHTML = `
    <span class="aksis-toast__icon">${icons[variant]}</span>
    <span class="aksis-toast__msg">${escapeHtml(message)}</span>
    ${actionHtml}
    <button class="aksis-toast__close" type="button" aria-label="Tutup">×</button>
  `;

  // Bind close
  el.querySelector(".aksis-toast__close")!.addEventListener("click", () => dismiss(el));

  // Bind action
  if (action) {
    el.querySelector(".aksis-toast__action")!.addEventListener("click", () => {
      action.onClick();
      dismiss(el);
    });
  }

  wrapper.appendChild(el);

  // Animate in
  requestAnimationFrame(() => el.classList.add("aksis-toast--visible"));

  // Auto dismiss
  if (duration > 0) {
    setTimeout(() => dismiss(el), duration);
  }
}

function dismiss(el: HTMLElement): void {
  if (!el.isConnected) return;
  el.classList.add("aksis-toast--exit");
  el.addEventListener("animationend", () => el.remove(), { once: true });
  // Fallback if animation doesn't fire
  setTimeout(() => { if (el.isConnected) el.remove(); }, 400);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]!);
}

// Convenience methods
export const toastSuccess = (msg: string) => toast(msg, "success");
export const toastError = (msg: string) => toast(msg, "error");
export const toastInfo = (msg: string) => toast(msg, "info");
export const toastWarning = (msg: string) => toast(msg, "warning");
