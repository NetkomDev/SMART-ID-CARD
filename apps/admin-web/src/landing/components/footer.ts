import type { ComponentMountContext } from "../types";

export function renderFooter(): string {
  return `
    <footer class="landing-footer">
      <div class="footer-top">
        <div class="footer-brand">
          <img src="/logo.png" alt="AKSIS" class="footer-logo" />
          <h3>AKSIS</h3>
          <p>Ekosistem Digital Sekolah Cerdas & Integrated Smart ID Card Pelajar Indonesia.</p>
        </div>

        <div class="footer-links">
          <div class="link-group">
            <h4>Navigasi Layanan</h4>
            <a href="#fitur">Fitur Utama</a>
            <a href="#modul">Modul Layanan</a>
            <a href="#keunggulan">Keunggulan AKSIS</a>
            <a href="#simulasi">Kalkulator Efisiensi</a>
          </div>

          <div class="link-group">
            <h4>Hubungi Kami</h4>
            <a href="https://wa.me/6285694488510?text=Halo%20AKSIS,%20saya%20tertarik%20dengan%20layanan%20sekolah%20cerdas%20untuk%20sekolah%20kami." target="_blank" rel="noopener noreferrer">💬 +62 856-9448-8510</a>
            <a href="mailto:info@aksis.co.id">✉ info@aksis.co.id</a>
            <a href="/login" id="footer-login">Portal Masuk Admin</a>
          </div>

          <div class="link-group">
            <h4>Platform AKSIS</h4>
            <p class="domain-badge">Smart School Ecosystem</p>
            <small>Hak Cipta &copy; 2026 AKSIS Platform. Seluruh Hak Dilindungi Undang-Undang.</small>
          </div>
        </div>
      </div>

      <div class="footer-bottom">
        <p>AKSIS &mdash; Solusi Presensi IoT, Smart ID Card, dan Ekosistem Sekolah Terpadu.</p>
      </div>
    </footer>
  `;
}

export function mountFooter(context: ComponentMountContext): void {
  const { container, navigate } = context;

  container.querySelector("#footer-login")?.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/login");
  });

  container.querySelectorAll<HTMLAnchorElement>('.footer-links a[href^="#"]').forEach((anchor) => {
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
