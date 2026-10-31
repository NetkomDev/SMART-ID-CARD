import QRCode from 'qrcode';import sharp from 'sharp';import{writeFile}from'node:fs/promises';
const code='a'.repeat(48),target=process.argv[2]||'/tmp/aksis-scanner-test.y4m';
const png=await QRCode.toBuffer(code,{width:320,margin:4,errorCorrectionLevel:'M'});
const gray=await sharp(png).flatten({background:'#fff'}).greyscale().extend({top:80,bottom:80,left:160,right:160,background:'#fff'}).raw().toBuffer();
const y=Buffer.from(gray.map(value=>16+Math.round(value*219/255))),chroma=Buffer.alloc(640*480/4,128),frame=Buffer.concat([Buffer.from('FRAME\n'),y,chroma,chroma]);
await writeFile(target,Buffer.concat([Buffer.from('YUV4MPEG2 W640 H480 F10:1 Ip A1:1 C420jpeg\n'),...Array(20).fill(frame)]));
console.log('Created synthetic QR camera fixture; no school credentials or pupil data.');
