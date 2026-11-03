import { stakeholderBenefits } from "../data";

export function renderStakeholders(): string {
  return `
    <section class="landing-section stakeholders-section" id="keunggulan">
      <div class="section-head">
        <span class="eyebrow">DIRANCANG UNTUK SELURUH WARGA SEKOLAH</span>
        <h2>Manfaat Nyata bagi Setiap Pemangku Kepentingan</h2>
        <p>AKSIS menyatukan seluruh elemen komunitas sekolah dalam satu alur kerja yang mudah, otomatis, dan transparan.</p>
      </div>

      <div class="stakeholders-grid">
        ${stakeholderBenefits.map((item) => `
          <div class="stakeholder-card">
            <div class="stakeholder-head">
              <div class="feature-icon ${item.themeColorClass}">${item.icon}</div>
              <div>
                <h3>${item.role}</h3>
                <span class="stakeholder-tagline">${item.tagline}</span>
              </div>
            </div>

            <ul class="stakeholder-list">
              ${item.benefits.map((b) => `<li><span class="check-icon">✓</span> ${b}</li>`).join("")}
            </ul>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}
