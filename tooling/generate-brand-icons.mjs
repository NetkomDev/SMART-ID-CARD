import sharp from "sharp";
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const masterPath = "/Users/berech/.gemini/antigravity-ide/brain/f380d515-40f5-439d-af34-9f175dfa05be/.user_uploaded/media_1793595212557.png";

function createIco(pngBuffers) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(pngBuffers.length, 4); // count

  let offset = 6 + (pngBuffers.length * 16);
  const dirEntries = [];
  for (const { buffer, width, height } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(buffer.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    dirEntries.push(entry);
    offset += buffer.length;
  }
  return Buffer.concat([header, ...dirEntries, ...pngBuffers.map((p) => p.buffer)]);
}

async function main() {
  console.log("Reading master logo from:", masterPath);
  const masterRaw = readFileSync(masterPath);

  // Save master copy
  const sharedAssetsDir = resolve("apps/shared/assets");
  if (!existsSync(sharedAssetsDir)) mkdirSync(sharedAssetsDir, { recursive: true });
  copyFileSync(masterPath, resolve(sharedAssetsDir, "aksis-logo-master.png"));

  // Trim to content bounding box
  const trimmedBuffer = await sharp(masterRaw).trim().toBuffer();
  const trimmedMeta = await sharp(trimmedBuffer).metadata();
  const W_trim = trimmedMeta.width;
  const H_trim = trimmedMeta.height;
  const AR = W_trim / H_trim;
  console.log(`Trimmed logo bounds: ${W_trim}x${H_trim} (AR: ${AR.toFixed(4)})`);

  // 1. icon-512.png (512x512 on pure white background, width = 400px)
  const targetW512 = 400;
  const targetH512 = Math.round(targetW512 / AR);
  const resized512 = await sharp(trimmedBuffer).resize(targetW512, targetH512, { fit: "contain" }).toBuffer();
  const icon512Buffer = await sharp({
    create: { width: 512, height: 512, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: resized512, left: Math.round((512 - targetW512) / 2), top: Math.round((512 - targetH512) / 2) }])
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();

  // 2. maskable-icon-512.png (512x512 on pure white background, width = 330px within 80% safe zone circle)
  const targetWMask = 330;
  const targetHMask = Math.round(targetWMask / AR);
  const resizedMask = await sharp(trimmedBuffer).resize(targetWMask, targetHMask, { fit: "contain" }).toBuffer();
  const maskableIcon512Buffer = await sharp({
    create: { width: 512, height: 512, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: resizedMask, left: Math.round((512 - targetWMask) / 2), top: Math.round((512 - targetHMask) / 2) }])
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();

  // 3. icon-192.png (192x192 on pure white background, width = 150px)
  const targetW192 = 150;
  const targetH192 = Math.round(targetW192 / AR);
  const resized192 = await sharp(trimmedBuffer).resize(targetW192, targetH192, { fit: "contain" }).toBuffer();
  const icon192Buffer = await sharp({
    create: { width: 192, height: 192, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: resized192, left: Math.round((192 - targetW192) / 2), top: Math.round((192 - targetH192) / 2) }])
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();

  // 4. apple-touch-icon.png (180x180 on pure white background, width = 140px)
  const targetW180 = 140;
  const targetH180 = Math.round(targetW180 / AR);
  const resized180 = await sharp(trimmedBuffer).resize(targetW180, targetH180, { fit: "contain" }).toBuffer();
  const appleTouchIconBuffer = await sharp({
    create: { width: 180, height: 180, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: resized180, left: Math.round((180 - targetW180) / 2), top: Math.round((180 - targetH180) / 2) }])
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();

  // 5. brand-mark.webp (Transparent WebP for headers, width = 192px)
  const targetWBrand = 192;
  const targetHBrand = Math.round(targetWBrand / AR);
  const brandMarkBuffer = await sharp(trimmedBuffer)
    .resize(targetWBrand, targetHBrand, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 95, lossless: true })
    .toBuffer();

  // 6. logo.png (High-resolution transparent PNG)
  const logoPngBuffer = await sharp(trimmedBuffer)
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();

  // 7. favicon.ico (Multi-frame transparent favicon for desktop browser tabs: 16x16, 32x32, 48x48)
  const fav16 = await sharp(trimmedBuffer)
    .resize(16, 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const fav32 = await sharp(trimmedBuffer)
    .resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const fav48 = await sharp(trimmedBuffer)
    .resize(48, 48, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const faviconIcoBuffer = createIco([
    { buffer: fav16, width: 16, height: 16 },
    { buffer: fav32, width: 32, height: 32 },
    { buffer: fav48, width: 48, height: 48 },
  ]);

  // 8. favicon-32x32.png
  const favicon32Buffer = fav32;

  // 9. icon.svg and Logo.svg (Clean vector SVG embedding high-res PNG data URI)
  const base64Png = logoPngBuffer.toString("base64");
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W_trim} ${H_trim}" width="100%" height="100%"><image width="${W_trim}" height="${H_trim}" href="data:image/png;base64,${base64Png}"/></svg>\n`;

  // Destination apps
  const appPublicDirs = [
    "apps/admin-web/public",
    "apps/attendance-pwa/public",
    "apps/extracurricular-pwa/public",
    "apps/library-terminal/public",
    "apps/waste-pwa/public",
    "apps/parent-pwa/public",
    "apps/command-center/public",
    "apps/led-gateway/public",
  ];

  for (const dir of appPublicDirs) {
    const fullDir = resolve(dir);
    if (!existsSync(fullDir)) mkdirSync(fullDir, { recursive: true });

    writeFileSync(resolve(fullDir, "icon-512.png"), icon512Buffer);
    writeFileSync(resolve(fullDir, "maskable-icon-512.png"), maskableIcon512Buffer);
    writeFileSync(resolve(fullDir, "icon-192.png"), icon192Buffer);
    writeFileSync(resolve(fullDir, "apple-touch-icon.png"), appleTouchIconBuffer);
    writeFileSync(resolve(fullDir, "brand-mark.webp"), brandMarkBuffer);
    writeFileSync(resolve(fullDir, "logo.png"), logoPngBuffer);
    writeFileSync(resolve(fullDir, "favicon.ico"), faviconIcoBuffer);
    writeFileSync(resolve(fullDir, "favicon-32x32.png"), favicon32Buffer);
    writeFileSync(resolve(fullDir, "icon.svg"), svgContent);
    console.log(`Updated assets in: ${dir}`);
  }

  // Root level assets
  writeFileSync(resolve("Launcher Icon.png"), icon512Buffer);
  writeFileSync(resolve("logo_transparent.png"), logoPngBuffer);
  writeFileSync(resolve("Logo.svg"), svgContent);
  writeFileSync(resolve("test-512.png"), icon512Buffer);
  console.log("Updated root level assets (Launcher Icon.png, logo_transparent.png, Logo.svg).");

  console.log("All brand icons generated successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
