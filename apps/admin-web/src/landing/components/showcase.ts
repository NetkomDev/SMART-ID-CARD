import { showcaseModules } from "../data";
import type { ComponentMountContext, ShowcaseModuleKey } from "../types";

export function renderShowcaseDisplay(tabKey: ShowcaseModuleKey = "idcard"): string {
  const data = showcaseModules[tabKey] || showcaseModules.idcard;

  return `
    <div class="showcase-card">
      <div class="showcase-text">
        <span class="eyebrow">${data.badge}</span>
        <h3>${data.icon} ${data.title}</h3>
        <p>${data.subtitle}</p>

        <ul class="showcase-list">
          ${data.features.map((f) => `<li><span class="check-icon">✓</span> ${f}</li>`).join("")}
        </ul>

        <div class="showcase-cta">
          <a href="https://wa.me/6285694488510?text=Halo%20AKSIS,%20saya%20tertarik%20dengan%20modul%20${encodeURIComponent(data.title)}." target="_blank" rel="noopener noreferrer" class="button primary">Konsultasi Modul Ini <span>→</span></a>
        </div>
      </div>

      <div class="showcase-visual">
        <div class="visual-glass-card">
          <div class="visual-header">
            <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
            <span class="visual-title">AKSIS &bull; ${data.title}</span>
          </div>
          <div class="visual-body">
            <div class="visual-mock-badge">${data.icon}</div>
            <h4>${data.title}</h4>
            <p>Terintegrasi secara otomatis dengan database sekolah & ekosistem terpadu.</p>
            <div class="visual-stat-row">
              <div><span>Status</span><strong>${data.statusLabel}</strong></div>
              <div><span>Integrasi</span><strong>${data.metricBadge}</strong></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderShowcase(): string {
  return `
    <section class="landing-section showcase-section" id="modul">
      <div class="section-head">
        <span class="eyebrow">7 MODUL LAYANAN EKOSISTEM AKSIS</span>
        <h2>Jelajahi Solusi Terpadu Sekolah Cerdas</h2>
        <p>Pilih modul di bawah untuk mempelajari peran dan manfaat spesifik bagi operasional sekolah Anda.</p>
      </div>

      <div class="showcase-tabs">
        <button class="showcase-tab active" data-tab="idcard">💳 Smart ID Card</button>
        <button class="showcase-tab" data-tab="presensi">🚪 Presensi IoT & LED</button>
        <button class="showcase-tab" data-tab="parent">📱 Portal Orang Tua</button>
        <button class="showcase-tab" data-tab="sampah">♻ Bank Sampah</button>
        <button class="showcase-tab" data-tab="perpus">▤ Perpustakaan</button>
        <button class="showcase-tab" data-tab="ekskul">⭐ Ekskul & eRapor</button>
        <button class="showcase-tab" data-tab="command">🖥 Command Center TV</button>
      </div>

      <div class="showcase-content-box" id="showcase-display">
        ${renderShowcaseDisplay("idcard")}
      </div>
    </section>
  `;
}

export function mountShowcase(context: ComponentMountContext): void {
  const { container } = context;

  const displayEl = container.querySelector<HTMLDivElement>("#showcase-display");
  if (!displayEl) return;

  container.querySelectorAll<HTMLButtonElement>(".showcase-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      container.querySelectorAll(".showcase-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const key = (tab.getAttribute("data-tab") || "idcard") as ShowcaseModuleKey;
      displayEl.innerHTML = renderShowcaseDisplay(key);
    });
  });
}
