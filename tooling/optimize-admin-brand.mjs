import sharp from 'sharp';
import { stat } from 'node:fs/promises';
const source='apps/admin-web/public/logo.png',target='apps/admin-web/public/brand-mark.webp';
await sharp(source).resize({width:192,height:192,fit:'inside',withoutEnlargement:true}).webp({quality:88,effort:6}).toFile(target);
console.log(JSON.stringify({source_bytes:(await stat(source)).size,target_bytes:(await stat(target)).size}));
