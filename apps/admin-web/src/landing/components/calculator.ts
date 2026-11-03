export interface EfficiencyMetrics {
  timeMinutes: number;
  wasteKg: number;
  teacherHoursSaved: number;
}

export function calculateMetrics(studentCount: number): EfficiencyMetrics {
  const timeMinutes = Math.ceil((studentCount * 0.8) / 60);
  const wasteKg = Math.round(studentCount * 0.3);
  const teacherHoursSaved = Math.round(studentCount * 0.05);
  return { timeMinutes, wasteKg, teacherHoursSaved };
}

export function renderCalculator(initialStudents: number = 750): string {
  const { timeMinutes, wasteKg, teacherHoursSaved } = calculateMetrics(initialStudents);

  return `
    <section class="landing-section calculator-section" id="simulasi">
      <div class="calculator-card">
        <div class="calculator-info">
          <span class="eyebrow">SIMULATOR EFISIENSI SEKOLAH</span>
          <h2>Kalkulator Efisiensi AKSIS</h2>
          <p>Geser jumlah siswa sekolah Anda untuk melihat proyeksi penghematan operasional dan dampak positif bulanan.</p>

          <div class="slider-group">
            <label for="student-slider">Jumlah Siswa Sekolah: <strong id="slider-val">${initialStudents.toLocaleString("id-ID")}</strong> Siswa</label>
            <input type="range" id="student-slider" min="100" max="3000" step="50" value="${initialStudents}" />
          </div>
        </div>

        <div class="calculator-results">
          <div class="calc-res-item">
            <span>Waktu Presensi Gerbang Harian</span>
            <strong id="res-time">&lt; ${timeMinutes} Menit Total</strong>
            <small>Menghemat ~2 jam antrean manual setiap pagi</small>
          </div>
          <div class="calc-res-item">
            <span>Proyeksi Setoran Sampah Terolah</span>
            <strong id="res-waste">~ ${wasteKg.toLocaleString("id-ID")} Kg / Bulan</strong>
            <small>Aksi nyata program sekolah hijau Adiwiyata</small>
          </div>
          <div class="calc-res-item">
            <span>Beban Administrasi Guru Dihemat</span>
            <strong id="res-teacher">~ ${teacherHoursSaved} Jam / Bulan</strong>
            <small>Otomatisasi rekap kehadiran gerbang & predikat ekskul</small>
          </div>
          <div class="calc-res-item">
            <span>Transparansi Orang Tua Siswa</span>
            <strong id="res-reports">100% Real-time</strong>
            <small>Notifikasi kehadiran instan tanpa biaya SMS manual</small>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function mountCalculator(container: HTMLElement): void {
  const slider = container.querySelector<HTMLInputElement>("#student-slider");
  const valDisplay = container.querySelector<HTMLElement>("#slider-val");
  const resTime = container.querySelector<HTMLElement>("#res-time");
  const resWaste = container.querySelector<HTMLElement>("#res-waste");
  const resTeacher = container.querySelector<HTMLElement>("#res-teacher");

  if (!slider || !valDisplay || !resTime || !resWaste || !resTeacher) return;

  slider.addEventListener("input", () => {
    const num = parseInt(slider.value, 10);
    valDisplay.textContent = num.toLocaleString("id-ID");

    const { timeMinutes, wasteKg, teacherHoursSaved } = calculateMetrics(num);
    resTime.textContent = `< ${timeMinutes} Menit Total`;
    resWaste.textContent = `~ ${wasteKg.toLocaleString("id-ID")} Kg / Bulan`;
    resTeacher.textContent = `~ ${teacherHoursSaved} Jam / Bulan`;
  });
}
