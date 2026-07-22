import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const energyApi = env.VITE_ENERGY_API_BASE || '';

  return {
    plugins: [react(), tailwindcss()],
    build: {
      chunkSizeWarningLimit: 2000, // mapbox-gl 번들이 큼 — 경고만 억제
    },
    server: {
      proxy: energyApi
        ? {
            // 발전소 실시간 데이터 — 브라우저 CORS 회피용 dev 프록시
            '/energy-api': {
              target: energyApi,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/energy-api/, ''),
              headers: { origin: 'https://energy.rmsgroup.co.kr' },
            },
          }
        : undefined,
    },
  };
});
