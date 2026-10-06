import sharp from "sharp";
import { pino } from "pino";

const logger = pino({ name: "photo-processor" });

/* ==========================================================================
   PIPELINE PEMROSESAN PAS FOTO SISWA (SERVER-SIDE)
   --------------------------------------------------------------------------
   HP orang tua hanya mengirim foto asli (sudah di-crop 3:4). Semua komputasi
   berat dijalankan di server / API eksternal, BUKAN di browser.

   Urutan provider (otomatis berdasarkan environment variable di Vercel):
   1. PHOTOROOM_API_KEY -> Photoroom Image Editing API v2
        - removeBackground (model segmentasi SOTA, aman untuk hijab/rambut)
        - background.color solid biru
        - lighting.mode=ai.auto (relighting AI: meratakan bayangan dagu/pipi)
   2. CLIPDROP_API_KEY  -> Clipdrop Remove Background + post-processing sharp
        - Mask cleaning (median filter = buang bintik noise di latar)
        - Feathering tepi (blur alpha = hilangkan tepi bergerigi)
        - CLAHE pada subjek (mengangkat area bayangan, bukan relighting penuh)
        - Komposit di atas kanvas biru solid
   3. Tanpa API key     -> foto ASLI disimpan apa adanya (tidak dirusak).

   PENGATURAN MANUAL:
   - Warna latar pas foto : PASFOTO_BG_HEX (default 0044FF = RGB(0, 68, 255))
   - Ukuran output        : OUTPUT_WIDTH x OUTPUT_HEIGHT (rasio 3:4)
   ========================================================================== */

const PASFOTO_BG_HEX = (process.env.PASFOTO_BG_HEX ?? "0044FF").replace("#", ""); // <-- WARNA LATAR BIRU
const OUTPUT_WIDTH = 900;   // <-- LEBAR OUTPUT (px)
const OUTPUT_HEIGHT = 1200; // <-- TINGGI OUTPUT (px), rasio 3:4
const JPEG_QUALITY = 92;    // <-- KUALITAS JPEG HASIL AKHIR
const API_TIMEOUT_MS = 45_000;

export type PhotoProvider = "photoroom" | "clipdrop" | "original";

export interface ProcessedPhoto {
  dataUrl: string;
  provider: PhotoProvider;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.replace(/^data:image\/[\w+.-]+;base64,/, ""), "base64");
}

function toJpegDataUrl(buf: Buffer): string {
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

async function postMultipart(url: string, apiKey: string, form: FormData): Promise<Buffer> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(API_TIMEOUT_MS)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${url} -> ${res.status} ${res.statusText} ${detail.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/* --------------------------------------------------------------------------
   PROVIDER 1: PHOTOROOM v2 (background removal + AI relighting, 1 request)
   -------------------------------------------------------------------------- */
async function processWithPhotoroom(input: Buffer, apiKey: string): Promise<Buffer> {
  const form = new FormData();
  form.append("imageFile", new Blob([new Uint8Array(input)], { type: "image/jpeg" }), "student.jpg");
  form.append("removeBackground", "true");
  form.append("background.color", PASFOTO_BG_HEX);
  form.append("lighting.mode", "ai.auto");              // <-- relighting AI (hapus bayangan keras)
  form.append("outputSize", `${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`);
  form.append("referenceBox", "originalImage");         // <-- pertahankan posisi crop dari orang tua
  const out = await postMultipart("https://image-api.photoroom.com/v2/edit", apiKey, form);
  // Normalisasi ke JPEG RGB padat (tanpa sisa transparansi)
  return sharp(out).flatten({ background: hexToRgb(PASFOTO_BG_HEX) }).jpeg({ quality: JPEG_QUALITY }).toBuffer();
}

/* --------------------------------------------------------------------------
   PROVIDER 2: CLIPDROP (background removal) + POST-PROCESSING SHARP
   -------------------------------------------------------------------------- */
async function processWithClipdrop(input: Buffer, apiKey: string): Promise<Buffer> {
  const form = new FormData();
  form.append("image_file", new Blob([new Uint8Array(input)], { type: "image/jpeg" }), "student.jpg");
  const png = await postMultipart("https://clipdrop-api.co/remove-background/v1", apiKey, form);

  const base = sharp(png).resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "cover", position: "top" });
  const resized = await base.ensureAlpha().png().toBuffer();

  // a. Mask cleaning + feathering pada channel alpha
  const alpha = await sharp(resized)
    .extractChannel(3)
    .median(5)   // <-- buang bintik noise kecil (setara morphological open)
    .blur(1.2)   // <-- feathering tepi hijab/bahu (naikkan = tepi lebih lembut)
    .toBuffer();

  // b. Angkat bayangan pada subjek (CLAHE luminance)
  const subjectRgb = await sharp(resized)
    .removeAlpha()
    .clahe({ width: 96, height: 96, maxSlope: 2 }) // <-- maxSlope lebih tinggi = bayangan makin terangkat
    .toBuffer();

  const subject = await sharp(subjectRgb).joinChannel(alpha).png().toBuffer();

  // c. Komposit halus di atas kanvas biru solid
  return sharp({
    create: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3, background: hexToRgb(PASFOTO_BG_HEX) }
  })
    .composite([{ input: subject }])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * Entry point worker. Tidak pernah melempar error: jika provider gagal,
 * foto asli tetap disimpan agar orang tua tidak perlu mengulang.
 */
export async function processStudentPhotoWorker(photoDataUrl: string): Promise<ProcessedPhoto> {
  const input = dataUrlToBuffer(photoDataUrl);
  const photoroomKey = process.env.PHOTOROOM_API_KEY;
  const clipdropKey = process.env.CLIPDROP_API_KEY;

  if (photoroomKey) {
    try {
      return { dataUrl: toJpegDataUrl(await processWithPhotoroom(input, photoroomKey)), provider: "photoroom" };
    } catch (err) {
      logger.error({ err }, "Photoroom processing failed");
    }
  }
  if (clipdropKey) {
    try {
      return { dataUrl: toJpegDataUrl(await processWithClipdrop(input, clipdropKey)), provider: "clipdrop" };
    } catch (err) {
      logger.error({ err }, "Clipdrop processing failed");
    }
  }
  if (!photoroomKey && !clipdropKey) {
    logger.warn("PHOTOROOM_API_KEY / CLIPDROP_API_KEY belum diset - foto asli disimpan tanpa makeover");
  }
  return { dataUrl: photoDataUrl, provider: "original" };
}
