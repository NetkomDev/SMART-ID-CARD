export const escapePortal = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function gateIntro(title: string, description: string) {
  return `<div class="gate-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 10V7a7 7 0 0 1 14 0v3M4 10h16v12H4zM12 14v4"/></svg></div><small>PORTAL SEKOLAH · AKSES TERBATAS</small><h1>${escapePortal(title)}</h1><p>${escapePortal(description)}</p>`;
}
export const gateHelp = `<div class="gate-help"><strong>Cara membuka portal</strong><ol><li>Minta link atau QR akses kepada Admin Sekolah.</li><li>Buka link atau pindai QR menggunakan kamera ponsel.</li><li>Setelah terhubung, simpan aplikasi ke layar utama.</li></ol></div>`;
export function schoolLabel(name: string) {
  let label = document.querySelector<HTMLElement>('.portal-school');
  if (!label) { label = document.createElement('small'); label.className = 'portal-school'; document.querySelector('header b')?.parentElement?.append(label); }
  label.textContent = name;
}
