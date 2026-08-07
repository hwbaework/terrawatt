import { DT_SCREENS, type DtItem } from '../data/dtScreens';
import { Drawer, Section } from './Drawer';
import { PlantScreen } from './PlantScreen';
import { PredictiveScreen } from './PredictiveScreen';

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
      <span className="flex items-center text-[11.5px] font-semibold text-slate-200">
        <span className={`mr-1.5 inline-block h-[7px] w-[7px] shrink-0 rounded-full ${DOT[item.status]}`} />
        {item.label}
      </span>
      <span className={`shrink-0 text-[13px] font-extrabold ${item.value ? 'text-slate-100' : 'text-slate-600'}`}>
        {item.value ?? '—'}
        {item.unit && <span className="ml-1 text-[10px] font-bold">{item.unit}</span>}
      </span>
    </div>
  );
}

export function DtScreenPanel({
  screenId,
  onClose,
  onBack,
  onRunGen,
}: {
  screenId: string;
  onClose: () => void;
  onBack?: () => void;
  /** 발전소 상세의 [발전량 시뮬레이션] 버튼 */
  onRunGen: () => void;
}) {
  const screen = DT_SCREENS.find((s) => s.id === screenId);
  if (!screen) return null;

  return (
    <Drawer title={screen.name} onClose={onClose} onBack={onBack}>
      {/* 값·계산이 있는 화면은 전용 컴포넌트로, 아직 항목만 있는 화면은 공통 목록으로 */}
      {screen.id === 'plant' ? (
        <PlantScreen onRunGen={onRunGen} />
      ) : screen.id === 'predictive' ? (
        <PredictiveScreen />
      ) : (
        screen.groups.map((g) => (
          <Section key={g.title} title={g.title}>
            {g.items.map((it) => (
              <ItemRow key={it.label} item={it} />
            ))}
          </Section>
        ))
      )}
    </Drawer>
  );
}
