import{defineConfig}from"vite";export default defineConfig({root:"apps/waste-pwa",build:{outDir:"dist",emptyOutDir:true},server:{port:4175,proxy:{"/api":"http://localhost:3000"}}});
