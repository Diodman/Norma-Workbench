import {defineConfig} from 'vite';
export default defineConfig({
  server:{host:'0.0.0.0',port:4173,strictPort:true,allowedHosts:['terminal.local']},
  build:{rollupOptions:{output:{manualChunks:{three:['three','three/addons/controls/OrbitControls.js']}}}}
});
