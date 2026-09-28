import {defineConfig} from "vite";
export default defineConfig({root:"apps/card-writer",server:{port:4180,proxy:{"/api":"http://localhost:3000"}},build:{outDir:"dist",emptyOutDir:true,sourcemap:true}});
