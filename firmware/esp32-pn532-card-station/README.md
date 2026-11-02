# Firmware Station Penulis Kartu AKSIS (ESP32 + PN532)

## Overview
Spesifikasi perakitan, pengkabelan, dan pengunggahan firmware station penulis kartu (*Card Writer Station*) yang dioperasikan pada lokasi produksi perusahaan (Super Admin) untuk memprogram dan memvalidasi chip MIFARE Classic 1K via Web Serial.

## Interface
### Komponen Perangkat Keras
- **Microcontroller:** ESP32 DevKit v1 (30 atau 38 pin)
- **NFC/RFID Module:** PN532 NFC RFID Reader/Writer Module (I2C mode)
- **Kartu Target:** MIFARE Classic 1K (13.56 MHz ISO/IEC 14443 Type A) + Stiker/Cetak QR Code fisik
- **Koneksi Host:** Kabel Data Micro-USB / USB-C (Web Serial API @ 115200 baud)

### Kontrak Protokol Serial Web
Station berkomunikasi dengan aplikasi `apps/card-writer` melalui Web Serial API (baudrate 115200):
- `READ_CARD`: Membaca UID chip dan payload data blok (`{"id": string, "command": "READ_CARD"}`).
- `WRITE_CARD`: Menulis payload ke sektor memori terproteksi (`{"id": string, "command": "WRITE_CARD", "payload": string, "expected_uid": string}`).

### Pengkabelan (Wiring Pinout - I2C Mode)
Switch jumper modul PN532: mode I2C (`SEL0 = L`, `SEL1 = H`):
| PN532 Pin | ESP32 GPIO | Keterangan |
| :--- | :--- | :--- |
| **VCC** | 5V / VIN | Catu daya 5V |
| **GND** | GND | Ground bersama |
| **SDA** | GPIO 21 | I2C Data |
| **SCL** | GPIO 22 | I2C Clock |
| **IRQ** | GPIO 4 | Interrupt Request (opsional) |
| **RSTPDN** | GPIO 5 | Reset pin |

## Invariants
- Blok 0 (UID pabrikan) tidak pernah ditimpa (bersifat *read-only* pada chip MIFARE asli).
- Penulisan payload memerlukan pencocokan `expected_uid`; jika UID kartu fisik tidak cocok, firmware menolak dan mengembalikan `UID_MISMATCH`.
- Autentikasi sektor 1 dan 2 menggunakan *Crypto1 Transport Key* yang diverifikasi sebelum operasi baca/tulis.

## Side Effects
- Memprogram sektor memori EEPROM chip NFC/RFID.
- Mengirimkan transmisi serial asinkron ke antarmuka USB host PC.

## Verification
- Run: `npm run build:card-writer`

- Payload ditulis pada Sektor 1 (Blok 4 dan Blok 5).
- Blok 7 (Sector Trailer) tidak diubah agar kunci default Key A tetap dapat diautentikasi kecuali kartu diprogram dengan Key korporasi pada tahap lanjutan.
