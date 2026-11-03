import type { ComponentMountContext } from "../types";

export function renderHeader(isLoggedIn: boolean): string {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
  const themeIcon = currentTheme === "dark" ? "☀️" : "🌙";

  return `
    <header class="landing-header">
      <div class="landing-header-inner">
        <a href="/" class="landing-brand" id="landing-brand-link">
          <img src="/logo.png" alt="AKSIS Logo" class="landing-logo-img" />
          <div class="landing-brand-text">
            <span class="brand-title">AKSIS</span>
            <span class="brand-sub">Smart School Ecosystem</span>
          </div>
        </a>

        <nav class="landing-nav">
          <a href="#fitur" class="landing-nav-link">Fitur Utama</a>
          <a href="#modul" class="landing-nav-link">Modul Fitur</a>
          <a href="#keunggulan" class="landing-nav-link">Keunggulan</a>
          <a href="#simulasi" class="landing-nav-link">Kalkulator</a>
          <a href="#kontak" class="landing-nav-link">Kontak</a>
        </nav>

        <div class="landing-actions">
          <button class="theme-toggle" id="landing-theme-toggle" title="Ubah Tema" aria-label="Ubah Tema">
            ${themeIcon}
          </button>

          ${isLoggedIn
            ? `<button class="button primary header-login-btn" id="btn-go-dashboard" title="Ke Dashboard" aria-label="Ke Dashboard"><span class="btn-icon">🔑</span><span class="btn-text">Dashboard</span> <span class="btn-arrow">→</span></button>`
            : `<button class="button primary header-login-btn" id="btn-login-admin" title="Masuk Portal" aria-label="Masuk Portal"><span class="btn-icon">🔑</span><span class="btn-text">Masuk</span> <span class="btn-arrow">→</span></button>`
          }
        </div>
      </div>
    </header>
  `;
}

export function mountHeader(context: ComponentMountContext): void {
  const { container, navigate } = context;

  // Theme toggle
  container.querySelector("#landing-theme-toggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("aksis-theme", next);
    const btn = container.querySelector("#landing-theme-toggle");
    if (btn) btn.textContent = next === "dark" ? "☀️" : "🌙";
  });

  // Login / Dashboard navigation
  container.querySelector("#btn-login-admin")?.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/login");
  });

  container.querySelector("#btn-go-dashboard")?.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/");
  });

  container.querySelector("#landing-brand-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Smooth scroll
  container.querySelectorAll<HTMLAnchorElement>('.landing-nav-link').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const targetId = anchor.getAttribute("href");
      if (targetId && targetId.startsWith("#")) {
        e.preventDefault();
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth" });
        }
      }
    });
  });
}
