import { DT_SCREENS, type DtItem } from '../data/dtScreens';
import type { PlantEventKind } from '../data/plantEvents';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ActionButton, Drawer, Section } from './Drawer';
import { DxDashboard } from './DxDashboard';
import { PlantScreen } from './PlantScreen';
import { PredictiveScreen } from './PredictiveScreen';
import { SafetyScreen } from './SafetyScreen';
import { FACILITIES } from '../data/facilities';

/** 이 화면들은 한일튜브(홈) 기준 — 발전소 코드는 시설 목록에서 */
const HOME_PLANT_CODE = FACILITIES.find((f) => f.id === 'hanil-tube')?.plantCode;

/* 디지털트윈 화면 — 계획서에 정의된 항목을 그대로 보여준다.

   지금은 **값이 아니라 뼈대**를 보여주는 단계다. 항목마다 "무엇을 · 어디서 · 얼마 주기로"
   받아올지가 적혀 있고, 값은 연동 전까지 비워 둔다.
   계측값을 임의의 숫자로 채우면 시연에서 거짓이 되기 때문. */

/* 상태는 **이름 앞 점** 하나로만 알린다 (사용자 지시: 정보가 많으면 안 읽힌다).
   출처·갱신주기는 데이터에는 남아 있지만 화면에는 쓰지 않는다. */
const DOT: Record<DtItem['status'], string> = {
  waiting: 'bg-slate-600',
  live: 'bg-emerald-400',
  spec: 'bg-emerald-400',
};

function ItemRow({ item }: { item: DtItem }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-2 last:border-0">
      <span className="flex items-center text-[13px] font-semibold text-slate-200">
        <span className={`mr-1.5 inline-block h-[7px] w-[7px] shrink-0 rounded-full ${DOT[item.status]}`} />
        {item.label}
      </span>
      <span className={`shrink-0 text-[13px] font-extrabold ${item.value ? 'text-slate-100' : 'text-slate-600'}`}>
        {item.value ?? '—'}
        {item.unit && <span className="ml-1 text-[12px] font-bold">{item.unit}</span>}
      </span>
    </div>
  );
}

export function DtScreenPanel({
  screenId,
  onClose,
  onBack,
  onRunGen,
  onEvent,
  activeEvent,
  onRunFlood,
  onRunFire,
  onRunQuake,
}: {
  screenId: string;
  onClose: () => void;
  onBack?: () => void;
  /** 발전소 상세의 [발전량 시뮬레이션] 버튼 */
  onRunGen: () => void;
  /** 발전소 상세의 설비 상태 클릭 → 이벤트 팝업 미리보기 */
  onEvent: (kind: PlantEventKind) => void;
  /** 지금 떠 있는 이벤트 — 해당 상태 점을 빨갛게 */
  activeEvent: PlantEventKind | null;
  /** 안전·화재 DiSOP의 재난 시뮬 버튼들 (재난 대응 = DiSOP 영역, p.159 CASE01~03) */
  onRunFlood: () => void;
  onRunFire: () => void;
  onRunQuake: () => void;
}) {
  const screen = DT_SCREENS.find((s) => s.id === screenId);
  // 예지보전·안전 통합 대시보드(아이티공간 연계 v1.1 7장) — 두 화면에서 연다
  const [dash, setDash] = useState(false);
  if (!screen) return null;

  return (
    <Drawer title={screen.name} onClose={onClose} onBack={onBack}>
      {/* 값·계산이 있는 화면은 전용 컴포넌트로, 아직 항목만 있는 화면은 공통 목록으로 */}
      {screen.id === 'plant' ? (
        <PlantScreen onRunGen={onRunGen} onEvent={onEvent} activeEvent={activeEvent} />
      ) : screen.id === 'predictive' ? (
        <>
          <PredictiveScreen plantCode={HOME_PLANT_CODE} />
          <ActionButton label="예지보전·안전 대시보드" onClick={() => setDash(true)} />
        </>
      ) : (
        <>
          {/* 안전·화재는 DX 실값(아이티공간 연계 v1.1) — 그 밖은 항목 뼈대 */}
          {screen.id === 'safety' ? (
            <>
              <SafetyScreen plantCode={HOME_PLANT_CODE} />
              <ActionButton label="예지보전·안전 대시보드" onClick={() => setDash(true)} />
            </>
          ) : (
            screen.groups.map((g) => (
              <Section key={g.title} title={g.title}>
                {g.items.map((it) => (
                  <ItemRow key={it.label} item={it} />
                ))}
              </Section>
            ))
          )}
          {/* 재난 대응 시뮬 = DiSOP 영역 — 이 화면 맨 아래에서 실행한다 (p.159 CASE01 화재·02 지진·03 침수).
              버튼은 좌우로 나란히 (사용자 지시) — 셋이 되면서 좁아져 라벨은 재난 이름만 */}
          {screen.id === 'safety' && (
            <div className="px-5 py-3">
              {/* 알람 테스트(2026-09-07 사용자 확정) — 설비(통신·전원) 알람은 발전소 상세의 설비 상태 클릭,
                  나머지 2계열은 여기서 눌러 본다. 근거: 전기화재 위험 = ITS API-006 전기안전지수(아크·누전),
                  태풍 = 기상청 기상특보. 실연동 시 이 버튼이 자동 감지(폴링)로 바뀐다 */}
              <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-slate-500">알람 테스트</div>
              <div className="mb-3 flex gap-2">
                {(
                  [
                    ['전기화재 위험', 'safetyArc'],
                    ['태풍경보', 'typhoon'],
                  ] as const
                ).map(([label, kind]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => onEvent(kind)}
                    className="flex-1 rounded-lg bg-red-500/15 px-3 py-2.5 text-[12px] font-bold text-red-300 transition-colors hover:bg-red-500/25"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-slate-500">시뮬레이션</div>
              <div className="flex gap-2">
                {(
                  [
                    ['화재', onRunFire],
                    ['지진', onRunQuake],
                    ['침수', onRunFlood],
                  ] as const
                ).map(([label, run]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={run}
                    className="flex-1 rounded-lg bg-blue-600/90 px-3 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-blue-600"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {/* 서랍(aside)의 blur·애니메이션이 fixed 를 가두므로 body 로 띄운다 */}
      {dash && createPortal(<DxDashboard initialPlant={HOME_PLANT_CODE} onClose={() => setDash(false)} />, document.body)}
    </Drawer>
  );
}
