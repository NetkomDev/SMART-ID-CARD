# Arsitektur Zero-Touch Provisioning (ZTP) via "Tap-to-Claim"

## Latar Belakang
Untuk menghilangkan beban pendaftaran alat secara manual oleh Super Admin atau Admin Sekolah, AKSIS mengadopsi mekanisme deteksi dan registrasi perangkat (Scanner, Gate, dll) secara otomatis yang disebut **"Tap-to-Claim"**.

## Konsep "Tap-to-Claim"
Perangkat input (seperti pembaca RFID/Smart Card) dirakit di pabrik dengan **satu firmware seragam** (tidak di-*hardcode* khusus untuk sekolah tertentu). Perangkat ini hanya memiliki identitas unik berupa MAC Address atau *Hardware ID* bawaan mesin.

### Alur Kerja (Workflow):
1. **Unassigned State:** Saat perangkat pertama kali dihidupkan dan terhubung ke internet, ia mengirimkan sinyal (`heartbeat`) ke server AKSIS bersama MAC Address-nya. Karena MAC Address ini belum ada di *database*, server memasukkannya ke dalam mode `Unassigned` (Siaga/Belum Terikat).
2. **Trigger (Pemindaian Kartu):** Seseorang (Admin/Siswa) menempelkan **Kartu ID AKSIS milik siswa manapun** ke perangkat tersebut.
3. **Payload:** Perangkat mengirim raw `card_uid` ke server.
4. **Validasi & Pengikatan (Binding):**
   - Server mengecek `card_uid` di *database*.
   - Server menemukan bahwa kartu tersebut adalah milik siswa dari (misalnya) SMA Negeri 1.
   - Karena alat tersebut memindai kartu SMA Negeri 1, Server berasumsi kuat alat tersebut secara fisik berada di SMA Negeri 1.
   - Server langsung meng-`insert`/`update` MAC Address perangkat tadi menjadi milik `school_id` SMA Negeri 1 di dalam tabel `devices`.
   - Server mengirim balik *Device Token* & *Device ID* rahasia ke perangkat tersebut.
5. **Active State:** Perangkat merespons berhasil (bunyi beep/lampu hijau), dan mulai beroperasi normal untuk mengirim data presensi ke sekolah yang bersangkutan.

## Penanganan Perangkat Monitor (LED Board / Smart TV)
Perangkat layar (seperti LED Board pengumuman atau Smart TV untuk Command Center Sekolah) **TIDAK** didaftarkan sebagai entitas `device` IoT di *database*. 
Karena sifatnya hanya sebagai *viewer* (menampilkan *dashboard*), alat tersebut hanya akan bertindak layaknya komputer biasa yang membuka *browser* dan memuat *web app* khusus *dashboard/monitor* yang *auto-refresh*. Hal ini menghemat *resource database* dan menyederhanakan arsitektur karena mereka tidak bertindak sebagai perangkat *input* atau pelapor data mentah.
