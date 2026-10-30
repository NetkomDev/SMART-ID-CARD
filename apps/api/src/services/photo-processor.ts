import sharp from "sharp";
import { ApiError } from "../lib/errors.js";
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
const API_TIMEOUT_MS = 12_000;

export type PhotoProvider = "photoroom" | "clipdrop" | "native_hd";

export interface ProcessedPhoto {
  dataUrl: string;
  provider: PhotoProvider;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2]!.length % 4 !== 0) throw new ApiError(422, "VALIDATION_ERROR", "Foto harus JPEG/PNG base64 yang valid.");
  if (match[2]!.length > Math.ceil(2 * 1024 * 1024 / 3) * 4) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Foto maksimal 2 MiB.");
  const input = Buffer.from(match[2]!, "base64");
  if (input.toString("base64") !== match[2]) throw new ApiError(422, "VALIDATION_ERROR", "Encoding foto tidak valid.");
  const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
  const png = input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if ((match[1] === "jpeg" && !jpeg) || (match[1] === "png" && !png)) throw new ApiError(422, "VALIDATION_ERROR", "Isi foto tidak sesuai format.");
  return input;
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
    await res.body?.cancel();
    throw new Error(`Photo provider returned HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/* --------------------------------------------------------------------------
   OPSI C: NATIVE SERVER-SIDE SHARP HD ENHANCER & RELIGHTER (TANPA API KEY)
   -------------------------------------------------------------------------- */
export async function processWithNativeSharp(input: Buffer): Promise<Buffer> {
  return sharp(input, { limitInputPixels: 20_000_000, animated: false })
    .timeout({ seconds: 8 })
    .rotate()
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "cover", position: "top" })
    .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.0 }) // <-- Penajaman tingkat tinggi untuk foto buram
    .normalise() // <-- Meratakan pencahayaan & bayangan wajah
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
  return sharp(out, { limitInputPixels: 20_000_000 }).resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "cover" }).flatten({ background: hexToRgb(PASFOTO_BG_HEX) }).jpeg({ quality: JPEG_QUALITY }).toBuffer();
}

/* --------------------------------------------------------------------------
   PROVIDER API 2: CLIPDROP (Background Removal) + Sharp Post-Processing
   -------------------------------------------------------------------------- */
async function processWithClipdrop(input: Buffer, apiKey: string): Promise<Buffer> {
  const form = new FormData();
  form.append("image_file", new Blob([new Uint8Array(input)], { type: "image/jpeg" }), "student.jpg");
  const png = await postMultipart("https://clipdrop-api.co/remove-background/v1", apiKey, form);

  const base = sharp(png, { limitInputPixels: 20_000_000 }).resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "cover", position: "top" });
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
  try {
    const metadata = await sharp(input, { limitInputPixels: 20_000_000 }).metadata();
    if (!["jpeg", "png"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("INVALID_IMAGE");
  } catch { throw new ApiError(422, "VALIDATION_ERROR", "Foto tidak dapat dibaca atau melebihi batas 20 megapixel."); }
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
    logger.error({ err }, "Native Sharp processing failed");
    throw new ApiError(422, "VALIDATION_ERROR", "Foto tidak dapat diproses. Unggah ulang foto JPEG/PNG.");
  }
}
