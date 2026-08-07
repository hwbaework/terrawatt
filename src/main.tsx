import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { VersionSwitch, currentVersion } from './VersionSwitch';

/* 버전 전환 — 기본 = v0.3, `?v=2` = v0.2(POC 보존본), `?v=1` = v0.1(초기 보존본).
   lazy import라 선택한 버전의 코드만 내려받는다 (다른 버전은 로드 안 됨). */
const version = currentVersion();
const App = lazy(() =>
  version === '1' ? import('./App') : version === '2' ? import('./v2/AppV2') : import('./v3/AppV3'),
);

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
    {/* v0.1은 코드를 건드리지 않기로 했으므로(동결), 버전 셀렉트를 바깥에서 얹는다.
        v0.2·v0.3은 각자 브랜드 카드 안에 셀렉트를 갖고 있다. */}
    {version === '1' && (
      <div
        style={{
          // v0.1 좌상단 브랜드 카드(left 16px + 너비 256px) 바로 옆
          position: 'fixed',
          top: 16,
          left: 280,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.6)',
          padding: '10px 12px',
          borderRadius: 12,
          fontFamily: 'inherit',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ marginBottom: 4, fontSize: 10, color: '#94a3b8' }}>버전</div>
        <VersionSwitch />
      </div>
    )}
  </StrictMode>,
);
