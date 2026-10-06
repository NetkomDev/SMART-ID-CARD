import sharp from "sharp";
import { pino } from "pino";

const logger = pino({ name: "photo-processor" });

/* ==========================================================================
   PIPELINE PEMROSESAN PAS FOTO SISWA (SERVER-SIDE WORKER)
   --------------------------------------------------------------------------
   Pilihan Opsi C (Tanpa API Key / Self-Contained Server Processing):
   1. Tanpa API Key Eksternal (Opsi C):
      - Menggunakan engine 'sharp' server-side native.
      - Melakukan upscaling & penajaman resolusi HD (900x1200 px).
      - Menyeimbangkan pencahayaan bayangan leher & pipi via CLAHE luminance equalizer.
      - TANPA ARTEFAK BROWSER / GARIS NOISE (murni diproses di server Node.js).
   2. Dengan API Key (Opsional jika diisi di Vercel):
      - PHOTOROOM_API_KEY: Photoroom v2 (Auto Remove Background & AI Relighting Studio).
      - CLIPDROP_API_KEY: Clipdrop (Remove Background) + Mask Cleaning & Solid Blue Canvas (#0044FF).
   ========================================================================== */

const PASFOTO_BG_HEX = (process.env.PASFOTO_BG_HEX ?? "0044FF").replace("#", ""); // <-- WARNA LATAR BIRU
const OUTPUT_WIDTH = 900;   // <-- LEBAR OUTPUT HD (px)
const OUTPUT_HEIGHT = 1200; // <-- TINGGI OUTPUT HD (px), rasio 3:4
const JPEG_QUALITY = 92;    // <-- KUALITAS JPEG HASIL AKHIR
const API_TIMEOUT_MS = 45_000;

export type PhotoProvider = "photoroom" | "clipdrop" | "native_hd" | "original";

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
   OPSI C: NATIVE SERVER-SIDE SHARP HD ENHANCER & RELIGHTER (TANPA API KEY)
   -------------------------------------------------------------------------- */
async function processWithNativeSharp(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "cover", position: "top" })
    .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.0 }) // <-- Penajaman tingkat tinggi untuk foto buram
    .clahe({ width: 96, height: 96, maxSlope: 1.8 }) // <-- Meratakan pencahayaan & bayangan wajah
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/* --------------------------------------------------------------------------
   PROVIDER API 1: PHOTOROOM v2 (Background Removal + AI Relighting)
   -------------------------------------------------------------------------- */
async function processWithPhotoroom(input: Buffer, apiKey: string): Promise<Buffer> {
  const form = new FormData();
  form.append("imageFile", new Blob([new Uint8Array(input)], { type: "image/jpeg" }), "student.jpg");
  form.append("removeBackground", "true");
  form.append("background.color", PASFOTO_BG_HEX);
  form.append("lighting.mode", "ai.auto");
  form.append("outputSize", `${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`);
  form.append("referenceBox", "originalImage");
  const out = await postMultipart("https://image-api.photoroom.com/v2/edit", apiKey, form);
  return sharp(out).flatten({ background: hexToRgb(PASFOTO_BG_HEX) }).jpeg({ quality: JPEG_QUALITY }).toBuffer();
}

/* --------------------------------------------------------------------------
   PROVIDER API 2: CLIPDROP (Background Removal) + Sharp Post-Processing
   -------------------------------------------------------------------------- */
async function processWithClipdrop(input: Buffer, apiKey: string): Promise<Buffer> {
  const form = new FormData();
  form.append("image_file", new Blob([new Uint8Array(input)], { type: "image/jpeg" }), "student.jpg");
  const png = await postMultipart("https://clipdrop-api.co/remove-background/v1", apiKey, form);

  const base = sharp(png).resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "cover", position: "top" });
  const resized = await base.ensureAlpha().png().toBuffer();

  const alpha = await sharp(resized)
    .extractChannel(3)
    .median(5)
    .blur(1.2)
    .toBuffer();

  const subjectRgb = await sharp(resized)
    .removeAlpha()
    .clahe({ width: 96, height: 96, maxSlope: 2 })
    .toBuffer();

  const subject = await sharp(subjectRgb).joinChannel(alpha).png().toBuffer();

  return sharp({
    create: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3, background: hexToRgb(PASFOTO_BG_HEX) }
  })
    .composite([{ input: subject }])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * ENTRY POINT WORKER SERVER-SIDE PEMROSESAN FOTO SISWA
 */
export async function processStudentPhotoWorker(photoDataUrl: string): Promise<ProcessedPhoto> {
  const input = dataUrlToBuffer(photoDataUrl);
  const photoroomKey = process.env.PHOTOROOM_API_KEY;
  const clipdropKey = process.env.CLIPDROP_API_KEY;

  if (photoroomKey) {
    try {
      logger.info("Executing Photoroom v2 API pipeline...");
      return { dataUrl: toJpegDataUrl(await processWithPhotoroom(input, photoroomKey)), provider: "photoroom" };
    } catch (err) {
      logger.error({ err }, "Photoroom API processing failed, falling back to Native Server Sharp Engine");
    }
  }

  if (clipdropKey) {
    try {
      logger.info("Executing Clipdrop API pipeline...");
      return { dataUrl: toJpegDataUrl(await processWithClipdrop(input, clipdropKey)), provider: "clipdrop" };
    } catch (err) {
      logger.error({ err }, "Clipdrop API processing failed, falling back to Native Server Sharp Engine");
    }
  }

  // OPSI C: PROSES SERVER NATIVE SOTA SHARP (TANPA API KEY)
  try {
    logger.info("Opsi C Aktif (Tanpa API Key): Executing Native Server-Side Sharp HD & Relighting Engine...");
    const enhancedBuf = await processWithNativeSharp(input);
    return { dataUrl: toJpegDataUrl(enhancedBuf), provider: "native_hd" };
  } catch (err) {
    logger.error({ err }, "Native Sharp processing failed, returning raw input");
    return { dataUrl: photoDataUrl, provider: "original" };
  }
}
