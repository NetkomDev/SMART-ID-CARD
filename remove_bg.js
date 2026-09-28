const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

async function removeWhite() {
    console.log("Loading image...");
    const imagePath = "/Users/berech/Documents/Smart ID Card/logo aksis.png";
    const outPath = "/Users/berech/Documents/Smart ID Card/AKSES.CO.ID/logo_transparent.png";
    
    try {
        const image = await Jimp.read(imagePath);
        console.log("Image loaded.");
        
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
            const red = this.bitmap.data[idx + 0];
            const green = this.bitmap.data[idx + 1];
            const blue = this.bitmap.data[idx + 2];
            const alpha = this.bitmap.data[idx + 3];

            // If it's mostly white (tolerance), make it transparent
            if (red > 240 && green > 240 && blue > 240) {
                this.bitmap.data[idx + 3] = 0; // Set alpha to 0
            }
        });
        
        await image.writeAsync(outPath);
        console.log("Successfully saved transparent image.");
        
        // Also copy it to all public folders as logo.png
        const apps = ["admin-web", "extracurricular-pwa", "library-terminal", "parent-pwa", "waste-pwa"];
        for (const app of apps) {
            const target = path.join("/Users/berech/Documents/Smart ID Card/AKSES.CO.ID/apps", app, "public/logo.png");
            fs.copyFileSync(outPath, target);
            console.log("Copied to", target);
        }
        
    } catch (err) {
        console.error(err);
    }
}

removeWhite();
