/**
 * Accessible, elegant confirmation modal dialog system.
 * Replaces native window.confirm with accessible HTML5 dialog.
 */

export interface ConfirmModalOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info" | "primary";
  icon?: string;
}

let stylesInjected = false;

function injectModalStyles(): void {
  if (stylesInjected || typeof document === "undefined") return;
  const existing = document.getElementById("aksis-confirm-dialog-styles");
  if (existing) {
    stylesInjected = true;
    return;
  }

  const style = document.createElement("style");
  style.id = "aksis-confirm-dialog-styles";
  style.textContent = `
    .aksis-confirm-dialog {
      padding: 0;
      border: 1px solid var(--line, #e2e8f0);
      border-radius: 1.25rem;
      background: var(--surface, #ffffff);
      color: var(--text, #0f172a);
      max-width: 440px;
      width: calc(100% - 2rem);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      animation: aksisModalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      overflow: hidden;
      margin: auto;
    }

    .aksis-confirm-dialog::backdrop {
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      animation: aksisFadeIn 0.2s ease-out forwards;
    }

    .aksis-confirm-dialog__content {
      padding: 1.5rem 1.5rem 1.25rem;
      display: flex;
      gap: 1rem;
      align-items: flex-start;
    }

    .aksis-confirm-dialog__icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .aksis-confirm-dialog__icon--warning {
      background: rgba(245, 158, 11, 0.12);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.25);
    }

    .aksis-confirm-dialog__icon--danger {
      background: rgba(239, 68, 68, 0.12);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.25);
    }

    .aksis-confirm-dialog__icon--info,
    .aksis-confirm-dialog__icon--primary {
      background: rgba(59, 130, 246, 0.12);
      color: #3b82f6;
      border: 1px solid rgba(59, 130, 246, 0.25);
    }

    .aksis-confirm-dialog__body {
      flex: 1;
      min-width: 0;
    }

    .aksis-confirm-dialog__body h3 {
      margin: 0 0 0.4rem;
      font-size: 1.12rem;
      font-weight: 700;
      color: var(--text, #0f172a);
      letter-spacing: -0.02em;
    }

    .aksis-confirm-dialog__body p {
      margin: 0;
      font-size: 0.88rem;
      line-height: 1.55;
      color: var(--muted, #64748b);
    }

    .aksis-confirm-dialog__actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 0.875rem 1.5rem;
      background: var(--bg-subtle, rgba(0, 0, 0, 0.02));
      border-top: 1px solid var(--line, #e2e8f0);
    }

    .aksis-confirm-dialog__actions button {
      padding: 0.6rem 1.15rem;
      font-size: 0.875rem;
      font-weight: 600;
      border-radius: 0.6rem;
    }

    @keyframes aksisModalIn {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    @keyframes aksisFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

const icons: Record<string, string> = {
  warning: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  danger: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  info: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  primary: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]!);
}

export function confirmModal(options: ConfirmModalOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(false);
      return;
    }

    injectModalStyles();

    const dialog = document.createElement("dialog");
    dialog.className = "aksis-confirm-dialog";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");

    const variant = options.variant ?? "primary";
    const iconSvg = options.icon ?? icons[variant] ?? icons.info;
    const confirmLabel = options.confirmLabel ?? (variant === "danger" ? "Ya, Hapus" : "Ya, Lanjutkan");
    const cancelLabel = options.cancelLabel ?? "Batal";
    const confirmBtnClass = variant === "danger" ? "button danger" : variant === "warning" ? "button warning" : "button primary";

    dialog.innerHTML = `
      <div class="aksis-confirm-dialog__content">
        <div class="aksis-confirm-dialog__icon aksis-confirm-dialog__icon--${variant}">
          ${iconSvg}
        </div>
        <div class="aksis-confirm-dialog__body">
          <h3 id="aksis-dialog-title">${escapeHtml(options.title)}</h3>
          <p id="aksis-dialog-desc">${escapeHtml(options.message)}</p>
        </div>
      </div>
      <div class="aksis-confirm-dialog__actions">
        <button type="button" class="button secondary" data-action="cancel">${escapeHtml(cancelLabel)}</button>
        <button type="button" class="${confirmBtnClass}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
      </div>
    `;

    dialog.setAttribute("aria-labelledby", "aksis-dialog-title");
    dialog.setAttribute("aria-describedby", "aksis-dialog-desc");

    document.body.appendChild(dialog);
    let resolved = false;

    const cleanup = (value: boolean) => {
      if (resolved) return;
      resolved = true;
      if (dialog.open) {
        dialog.close();
      }
      dialog.remove();
      resolve(value);
    };

    const confirmBtn = dialog.querySelector<HTMLButtonElement>('[data-action="confirm"]');
    const cancelBtn = dialog.querySelector<HTMLButtonElement>('[data-action="cancel"]');

    confirmBtn?.addEventListener("click", () => cleanup(true));
    cancelBtn?.addEventListener("click", () => cleanup(false));

    // Backdrop click cancels
    dialog.addEventListener("click", (e) => {
      const rect = dialog.getBoundingClientRect();
      const isInDialog = (
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width
      );
      if (!isInDialog) {
        cleanup(false);
      }
    });

    // Escape or close event cancels
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      cleanup(false);
    });

    dialog.addEventListener("close", () => {
      cleanup(false);
    });

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      // Focus cancel button by default for safety on destructive actions
      cancelBtn?.focus();
    } else {
      // Fallback for environments without native showModal
      dialog.setAttribute("open", "");
      cancelBtn?.focus();
    }
  });
}
