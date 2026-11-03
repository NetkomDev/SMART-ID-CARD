export function renderContact(): string {
  return `
    <!-- Contact Section -->
    <section class="landing-section contact-section" id="kontak">
      <div class="section-head">
        <span class="eyebrow">KONSULTASI & LAYANAN SEKOLAH</span>
        <h2>Hubungi Tim AKSIS</h2>
        <p>Kami siap membantu dan berkonsultasi mengenai implementasi sistem sekolah cerdas di sekolah Anda.</p>
      </div>

      <div class="contact-grid">
        <a href="https://wa.me/6285694488510?text=Halo%20AKSIS,%20saya%20tertarik%20dengan%20layanan%20sekolah%20cerdas%20untuk%20sekolah%20kami." target="_blank" rel="noopener noreferrer" class="contact-card whatsapp">
          <div class="contact-card-icon">💬</div>
          <div class="contact-card-info">
            <span class="contact-card-label">WhatsApp Official</span>
            <strong class="contact-card-value">+62 856-9448-8510</strong>
            <span class="contact-card-action">Hubungi via WhatsApp &rarr;</span>
          </div>
        </a>

        <a href="mailto:info@aksis.co.id" class="contact-card email">
          <div class="contact-card-icon">✉</div>
          <div class="contact-card-info">
            <span class="contact-card-label">Email Respon Cepat</span>
            <strong class="contact-card-value">info@aksis.co.id</strong>
            <span class="contact-card-action">Kirim Email Konsultasi &rarr;</span>
          </div>
        </a>
      </div>
    </section>

    <!-- Floating WhatsApp Button -->
    <a href="https://wa.me/6285694488510?text=Halo%20AKSIS,%20saya%20tertarik%20dengan%20layanan%20sekolah%20cerdas%20untuk%20sekolah%20kami." target="_blank" rel="noopener noreferrer" class="floating-wa-btn" title="Chat WhatsApp +62 856-9448-8510" aria-label="Chat WhatsApp Official AKSIS">
      <span class="wa-btn-icon">💬</span>
      <span class="wa-btn-text">Chat WhatsApp</span>
    </a>
  `;
}
