import { PLANNED_ASSETS, type PlannedAsset } from '../data/plannedAssets';
import { DT_SCREENS } from '../data/dtScreens';
import { Drawer, Row, Section } from './Drawer';
import { MIcon } from '../../v2/lib/MIcon';

/* 예정 자산(수소·ORC·ESS·V2G) 정보 — 오른쪽 패널.

   FacilityPanel(한일튜브)과 다른 점: 아직 **실물이 없다.**
   그래서 이 패널의 역할은 "완공·연동되면 여기에 이런 것들이 보인다"를 미리 그려두는 것이다.
   스펙은 엑셀(DT정리v0.2) 값 그대로, 계측값은 지어내지 않고 '연동 후' 자리만 잡는다. */

/** 계측값 자리 — 값 대신 "연동 후"를 흐리게 */
function ExpectedTile({ label, unit }: { label: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-2.5">
      <div className="text-[12px] text-slate-400">{label}</div>
      <div className="mt-0.5 text-[13px] font-extrabold leading-tight text-slate-600">
        — <span className="text-[11px] font-bold">연동 후</span>
        {unit && <span className="ml-1 text-[12px] font-bold text-slate-700">{unit}</span>}
      </div>
    </div>
  );
}

export function AssetPanel({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const a = PLANNED_ASSETS.find((x) => x.id === assetId);
  if (!a) return null;

  return (
    <Drawer
      title={a.name}
      badge={a.excelId}
      onClose={onClose}
      subtitle={
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[12px] font-bold text-amber-300">
            예상 화면 (임시)
          </span>
          <span className="text-slate-500">완공·데이터 연동 전 — 엑셀 DT정리v0.2 기준</span>
        </span>
      }
    >
      {/* 위치가 대략/미확정임을 패널에서도 분명히 */}
      <div className="mx-5 mb-1 flex items-start gap-1.5 rounded-lg bg-white/[0.04] px-3 py-2">
        <MIcon name="location_on" size={13} className="mt-0.5 shrink-0 text-slate-500" />
        <span className="text-[12px] leading-relaxed text-slate-400">{a.locationNote}</span>
      </div>

      <Section title="시설 정보">
        <div className="divide-y divide-white/5">
          {a.specs.map((s) => (
            <Row key={s.label} label={s.label}>
              {s.value}
            </Row>
          ))}
          <Row label="진행">
            <span className="text-amber-300">◐ {a.status}</span>
          </Row>
        </div>
      </Section>

      {/* 완공·연동 후 보일 것들 — 지금은 자리만 */}
      {a.expected.map((g) => (
        <Section key={g.group} title={`예상 표출 — ${g.group}`}>
          <div className="grid grid-cols-2 gap-2">
            {g.items.map((it) => (
              <ExpectedTile key={it.label} label={it.label} unit={it.unit} />
            ))}
          </div>
        </Section>
      ))}

      <Section title="데이터 경로 · 협의">
        <p className="text-[13px] leading-relaxed text-slate-400">{a.dataNote}</p>
      </Section>
    </Drawer>
  );
}

/* ── 자산용 DT 화면 스텁 ──
   오른쪽 아이콘 바(발전소 상세·예지보전·안전화재)를 예정 자산에서 눌렀을 때 나오는 화면.
   한일튜브의 DtScreenPanel 같은 실화면이 아니라, "연동되면 여기 이런 게 보인다"를
   엑셀 기준으로 미리 잡아둔 자리다. 데이터가 확정되면 이 스텁을 실화면으로 갈아끼운다. */

/** 화면별로 자산의 expected 그룹에서 무엇을 보여줄지 고른다 */
function groupsForScreen(a: PlannedAsset, screenId: string) {
  if (screenId === 'plant')
    return a.expected.filter((g) => g.group.startsWith('운전') || g.group.startsWith('전기'));
  if (screenId === 'safety') return a.expected.filter((g) => g.group.includes('안전'));
  return [];
}

/** 예지보전은 자산 공통 — DT-PM-01(아이티공간 UYeG) 결과 4종을 받는다 */
/* 예지보전 = 센서가 잰 값 · Health Index(울산 플랫폼 기준, 2026-10-29). 잔여수명 · 고장예지는 API 소스가 없고,
   위험등급은 안전(전기안전지수) 쪽이라 뺐다 */
const PM_ITEMS: { label: string; unit?: string }[] = [
  { label: '건전성 지수 (Health Index)' },
];

export function AssetDtStub({
  assetId,
  screenId,
  onClose,
}: {
  assetId: string;
  screenId: string;
  onClose: () => void;
}) {
  const a = PLANNED_ASSETS.find((x) => x.id === assetId);
  const screen = DT_SCREENS.find((s) => s.id === screenId);
  if (!a || !screen) return null;

  const groups = groupsForScreen(a, screenId);

  return (
    <Drawer
      title={`${a.name} — ${screen.name}`}
      badge={a.excelId}
      onClose={onClose}
      subtitle={
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[12px] font-bold text-amber-300">
            예상 화면 (임시)
          </span>
          <span className="text-slate-500">완공·데이터 연동 후 실제 화면으로 전환</span>
        </span>
      }
    >
      {screenId === 'predictive' ? (
        <>
          <Section title="설비 상태 — 아이티공간 UYeG">
            <div className="grid grid-cols-2 gap-2">
              {PM_ITEMS.map((it) => (
                <ExpectedTile key={it.label} label={it.label} unit={it.unit} />
              ))}
            </div>
          </Section>
          <Section title="대상 설비">
            <div className="divide-y divide-white/5">
              <Row label="설비 단위">{a.pmTarget}</Row>
              <Row label="수신 형태">
                <span className="text-amber-300">협의중 (API 규격·등급 단계)</span>
              </Row>
            </div>
          </Section>
        </>
      ) : groups.length > 0 ? (
        groups.map((g) => (
          <Section key={g.group} title={`예상 표출 — ${g.group}`}>
            <div className="grid grid-cols-2 gap-2">
              {g.items.map((it) => (
                <ExpectedTile key={it.label} label={it.label} unit={it.unit} />
              ))}
            </div>
          </Section>
        ))
      ) : (
        <Section title="예상 표출">
          <p className="text-[13px] leading-relaxed text-slate-400">
            이 자산은 계획서(3.데이터목록)에 이 화면용 별도 항목이 없습니다 — 수집 범위 협의 후 확정.
          </p>
        </Section>
      )}

      <Section title="데이터 경로 · 협의">
        <p className="text-[13px] leading-relaxed text-slate-400">{a.dataNote}</p>
      </Section>
    </Drawer>
  );
}
