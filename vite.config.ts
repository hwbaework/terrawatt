import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const energyApi = env.VITE_ENERGY_API_BASE || '';
  // DX 예지보전·안전지수(UMEI) — 키는 VITE_ 가 아니라 번들에 안 들어간다. 배포는 worker/index.ts 가 같은 일을 한다
  const umeiKey = env.UMEI_API_KEY || '';

  return {
    plugins: [react(), tailwindcss()],
    build: {
      chunkSizeWarningLimit: 2000, // mapbox-gl 번들이 큼 — 경고만 억제
    },
    server: {
      // 개발 서버 주소 고정 — 브이월드 인증키에 등록한 주소(http://localhost:5173)와 반드시 일치해야 한다.
      // strictPort: 포트가 이미 쓰이고 있으면 다른 번호로 옮겨가지 말고 **에러를 내라**.
      // (조용히 5174 등으로 바뀌면 브이월드가 등록 안 된 주소로 보고 지도를 안 준다)
      port: 5173,
      strictPort: true,
      proxy: {
        ...(energyApi
          ? {
              // 발전소 실시간 데이터 — 브라우저 CORS 회피용 dev 프록시
              '/energy-api': {
                target: energyApi,
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/energy-api/, ''),
                headers: { origin: 'https://energy.rmsgroup.co.kr' },
              },
            }
          : {}),
        ...(umeiKey
          ? {
              '/umei-api': {
                target: 'https://umei.uyegdx.com',
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/umei-api/, ''),
                headers: { 'X-API-Key': umeiKey },
              },
            }
          : {}),
      },
    },
  };
});
