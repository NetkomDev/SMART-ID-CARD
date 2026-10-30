# Firmware Station Penulis Kartu AKSIS (ESP32 + PN532)

Dokumen ini menjelaskan spesifikasi perakitan dan pengunggahan firmware station penulis kartu (*Card Writer Station*) yang dioperasikan pada lokasi produksi perusahaan (Super Admin).

## 1. Komponen Perangkat Keras
- **Microcontroller:** ESP32 DevKit v1 (30 atau 38 pin)
- **NFC/RFID Module:** PN532 NFC RFID Reader/Writer Module (merah atau biru)
- **Kartu Target:** MIFARE Classic 1K (13.56 MHz ISO/IEC 14443 Type A) + Stiker/Cetak QR Code fisik
- **Koneksi Host:** Kabel Data Micro-USB / USB-C ke Laptop/PC Operator (Web Serial API)

## 2. Pengkabelan (Wiring Pinout - I2C Mode)
Pastikan switch jumper pada modul PN532 diset ke mode **I2C** (`SEL0 = L`, `SEL1 = H`):

| PN532 Pin | ESP32 GPIO | Keterangan |
| :--- | :--- | :--- |
| **VCC** | 5V / VIN | Catu daya 5V |
| **GND** | GND | Ground bersama |
| **SDA** | GPIO 21 | I2C Data |
| **SCL** | GPIO 22 | I2C Clock |
| **IRQ** | GPIO 4 | Interrupt Request (opsional) |
| **RSTPDN** | GPIO 5 | Reset pin |

## 3. Dependensi Library Arduino IDE / PlatformIO
Install library berikut melalui *Library Manager*:
1. `Adafruit PN532` (oleh Adafruit)
2. `ArduinoJson` (v6.x atau v7.x oleh Benoit Blanchon)

## 4. Kontrak Protokol Serial Web
Station berkomunikasi dengan aplikasi [apps/card-writer](file:///Users/berech/Documents/Smart%20ID%20Card/AKSIS.CO.ID/apps/card-writer) melalui browser desktop yang mendukung Web Serial API (Chrome, Edge, Opera) pada baudrate **115200**:

### A. Perintah Baca Kartu
- **Kirim dari Browser:**
  ```json
  {"id":"uuid-request-1","command":"READ_CARD"}
  ```
- **Balasan Firmware (Berhasil):**
  ```json
  {"id":"uuid-request-1","ok":true,"uid":"A1B2C3D4","payload":"AKSIS:STU:102938"}
  ```
- **Balasan Firmware (Gagal/Tidak Ada Kartu):**
  ```json
  {"id":"uuid-request-1","ok":false,"error":"NO_CARD"}
  ```

### B. Perintah Tulis Kartu
- **Kirim dari Browser:**
  ```json
  {"id":"uuid-request-2","command":"WRITE_CARD","payload":"AKSIS:STU:102938","expected_uid":"A1B2C3D4"}
  ```
- **Balasan Firmware (Berhasil):**
  ```json
  {"id":"uuid-request-2","ok":true,"uid":"A1B2C3D4"}
  ```
- **Balasan Firmware (UID Tidak Cocok / Manipulasi Kartu):**
  ```json
  {"id":"uuid-request-2","ok":false,"uid":"F5E4D3C2","error":"UID_MISMATCH"}
  ```

## 5. Keamanan Memori Kartu
- Blok 0 (UID pabrikan) tidak pernah ditimpa (bersifat *read-only* pada chip MIFARE asli).
- Payload ditulis pada Sektor 1 (Blok 4 dan Blok 5).
- Blok 7 (Sector Trailer) tidak diubah agar kunci default Key A tetap dapat diautentikasi kecuali kartu diprogram dengan Key korporasi pada tahap lanjutan.
