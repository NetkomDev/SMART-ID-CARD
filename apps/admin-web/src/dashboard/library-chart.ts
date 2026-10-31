type ClassRank = { class_id: string; name: string; value: number; rank: number };
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const number = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);
const colors = ["#22b8cf", "#51c694", "#f6b443", "#a78bfa", "#f472b6"];

/** Labels live in an HTML legend, never outside an SVG viewBox. */
export function renderLibraryChart(rows: ClassRank[], reportedTotal: number) {
  if (!rows.length && reportedTotal <= 0) return `<div class="cc-empty"><span>▤</span><p>Belum ada kunjungan perpustakaan.</p></div>`;
  const sorted = rows.filter(r => Number.isFinite(r.value) && r.value > 0).sort((a, b) => b.value - a.value);
  const mappedTotal = sorted.reduce((sum, r) => sum + r.value, 0);
  const total = Math.max(mappedTotal, reportedTotal);
  const groups = sorted.slice(0, 4).map(r => ({ name: r.name, value: r.value }));
  const remainder = total - groups.reduce((sum, r) => sum + r.value, 0);
  if (remainder > 0) groups.push({ name: sorted.length > 4 ? "Kelas lainnya / tanpa kelas" : "Tanpa kelas tercatat", value: remainder });
  const circumference = 2 * Math.PI * 58;
  let offset = 0;
  const segments = groups.map((row, i) => {
    const length = total > 0 ? row.value / total * circumference : 0;
    const svg = `<circle cx="80" cy="80" r="58" fill="none" stroke="${colors[i]}" stroke-width="16" stroke-dasharray="${length} ${circumference}" stroke-dashoffset="${-offset}" />`;
    offset += length;
    return svg;
  }).join("");
  const lowest = [...rows].sort((a, b) => a.value - b.value || a.name.localeCompare(b.name)).slice(0, 3);
  return `<div class="cc-library-view">
    <div class="cc-library-donut-container">
      <div class="cc-library-svg-wrapper">
        <svg class="cc-library-donut-svg" viewBox="0 0 160 160" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Total ${number(total)} kunjungan">
          <circle cx="80" cy="80" r="58" fill="none" stroke="#ffffff0d" stroke-width="16" />
          <g transform="rotate(-90 80 80)">${segments}</g>
          <text x="80" y="65" text-anchor="middle" font-size="9" font-weight="700" fill="#94a3b8">TOTAL</text>
          <text x="80" y="88" text-anchor="middle" font-size="27" font-weight="800" fill="#f8fafc">${number(total)}</text>
          <text x="80" y="105" text-anchor="middle" font-size="9" fill="#94a3b8">KUNJUNGAN</text>
        </svg>
      </div>
      <ul class="cc-library-legend" aria-label="Kunjungan per kelas">${groups.map((row, i) => `<li style="--slice-color:${colors[i]}"><span class="cc-legend-dot"></span><span class="cc-legend-name" title="${esc(row.name)}">${esc(row.name)}</span><span class="cc-legend-number">${number(row.value)} <small>· ${Math.round(row.value / total * 100)}%</small></span></li>`).join("")}</ul>
    </div>
    ${lowest.length ? `<div class="cc-lowest-section"><div class="cc-lowest-header"><span class="cc-eyebrow-lowest">TERENDAH PADA KELAS TERCATAT</span></div><div class="cc-lowest-pills">${lowest.map(row => `<div class="cc-lowest-pill"><span class="cc-lowest-dot"></span><div class="cc-lowest-info"><strong title="${esc(row.name)}">${esc(row.name)}</strong><span>${number(row.value)} kali</span></div></div>`).join("")}</div>` : ""}
  </div>`;
}
