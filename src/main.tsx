import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

/* 버전 전환 — 기본 = v0.2, 주소 뒤에 ?v=1 붙이면 v0.1(보존본).
   lazy import라 선택한 버전의 코드만 내려받는다 (다른 버전은 로드 안 됨). */
const useV1 = new URLSearchParams(window.location.search).get('v') === '1';
const App = lazy(() => (useV1 ? import('./App') : import('./v2/AppV2')));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense
      fallback={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: '#0f172a',
            color: '#94a3b8',
            fontFamily: 'sans-serif',
            fontSize: 14,
          }}
        >
          ⚡ TerraWatt 불러오는 중…
        </div>
      }
    >
      <App />
    </Suspense>
    {/* v0.1 위에 떠 있는 복귀 배지 — v0.1 코드는 그대로 두고 바깥에서 얹음 */}
    {useV1 && (
      <a
        href={window.location.pathname}
        style={{
          // v0.1 좌상단 브랜드 카드(left 16px + 너비 256px) 바로 옆 — 같은 카드 스타일로 통일
          position: 'fixed',
          top: 16,
          left: 280,
          zIndex: 9999,
          display: 'block',
          background: 'rgba(0,0,0,0.6)',
          padding: '12px',
          borderRadius: 12,
          fontFamily: 'inherit',
          textDecoration: 'none',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.025em', color: '#ffffff' }}>
          ⚡ v0.2로 돌아가기
        </div>
        <div style={{ marginTop: 2, fontSize: 10, color: '#94a3b8' }}>지금은 v0.1 (이전 버전)</div>
      </a>
    )}
  </StrictMode>,
);
