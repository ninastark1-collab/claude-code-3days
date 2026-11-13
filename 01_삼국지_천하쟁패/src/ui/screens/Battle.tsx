import { useEffect, useRef, useState } from 'react';
import { setBgmDuel } from '../../audio/director';
import { josa } from '../../engine/josa';
import { campOf, eraLabel } from '../../data/eras';
import { runPlannedBattle, setPlan, startPlannedBattle } from '../../engine/battle/auto';
import { activeUnits, rngOf } from '../../engine/battle/battle';
import {
  ATK_POLICIES,
  DEF_POLICIES,
  POLICIES,
  RETREAT_OPTIONS,
  ROLE_NAME,
  ROLES,
  STANCE_NAME,
  STANCES,
  advisorOf,
  aiChoosePolicy,
  commanderOf,
  defaultDuelPolicy,
  defaultPlan,
  execFactor,
  executionOf,
  policyCheck,
  switchPolicy,
} from '../../engine/battle/plan';
import { battleReport } from '../../engine/battle/report';
import { KIND_NAME, TICKS_PER_DAY, type BattleState, type DuelLog, type BUnit, type PolicyId, type SidePlan, type Terrain, type UnitPlan } from '../../engine/battle/types';
import { heroDesc, type HeroLookInput } from '../../render3d/models/hero';
import { DuelScene3D, type DuelSide } from '../render3d/DuelScene3D';
import { CAN_3D, quality3D } from '../render3d/support';
import { faceOf } from '../portrait';
import { BattleStage } from '../../render3d/stages/battle';
import { DuelScene } from '../battle/DuelScene';
import { Scene3D, seasonOf } from '../render3d/Scene3D';
import { SiegeBars } from '../render3d/SiegeBars';
import { SquadLabels } from '../render3d/SquadLabels';
import { setSpriteLoadListener, tileSprite, unitSprite, type TileKind } from '../battle/sprites';
import { Bar, Btn, Modal, Portrait, Seal, fmt, useGame } from '../common';
import { SaveLoadModal } from '../components/SaveLoad';
import { useSettings } from '../settings';
import { sfx } from '../sound';
import { advanceBattle, useStore } from '../store';
import { factionColor, sealChar, tokenValue } from '../theme';
import { useViewSize } from '../viewport';

/**
 * 관전 속도: 1배·2배·4배 (초당 틱).
 * v2 설계서 10-1: 1배속 일반 전투 2분 30초~4분. 실제 전투 평균 약 105틱이라 1배 = 초당 0.65틱 (하루 약 18초).
 * 부대는 화면에서 연속으로 움직이므로 느려도 끊겨 보이지 않는다.
 */
export const TPS = [0, 0.65, 1.3, 2.6];
/** 승패가 정해진 뒤 결과창까지 전장을 더 보여 주는 시간 (종료 연출) */
export const OUTRO_MS = 4200;
const QUALITY_3D = quality3D();

/** 책략·큰 사건 컷인 한자 (설계서 연출 각본: 책략 발동 = 사선 띠 컷인) */
function cutHz(text: string): string | null {
  if (text.startsWith('화공')) return '火計';
  if (text.startsWith('복병')) return '伏兵';
  if (text.startsWith('성문')) return '城門突破';
  if (text.startsWith('성벽')) return '城壁崩壞';
  return null;
}

const ROUND_HZ = ['一合', '二合', '三合'];

/** 3D 일기토 위에 겹치는 글: 도입 컷인(두 장수 초상) → 합 표시 → 결과 */
function Duel3DOverlay({ duel, state, portrait }: { duel: DuelLog; state: { round: number; phase: 'intro' | 'fight' | 'result' }; portrait: (officer: string) => string | null }) {
  const lineA = duel.lineA ?? `${duel.b}! 나와 승부를 겨루자!`;
  const lineB = duel.lineB ?? ((duel.bWar ?? 0) >= (duel.aWar ?? 0) - 5 ? '좋다, 상대해 주마!' : '……피할 수는 없겠구나.');
  const pa = duel.aId ? portrait(duel.aId) : null;
  const pb = duel.bId ? portrait(duel.bId) : null;
  return (
    <div className="duel3d" role="status" aria-live="polite">
      {state.phase === 'intro' && (
        <div className="cut3d on duo">
          <div className="band">
            {pa && <img src={pa} alt="" />}
            <div className="ct">
              <b>一騎討</b>
              <span>
                {duel.a} 대 {duel.b}
              </span>
              <small>{duel.source ?? `「${lineA}」 「${lineB}」`}</small>
            </div>
            {pb && <img src={pb} alt="" className="flip" />}
          </div>
        </div>
      )}
      {state.phase === 'fight' && state.round >= 0 && (
        <div key={state.round} className="duel3d-round">
          {ROUND_HZ[state.round] ?? ''}
        </div>
      )}
      {state.phase === 'result' && (
        <div className="duel3d-result">
          <b>{duel.outcome}</b>
          {duel.winner && (
            <small>
              {duel.winner} 부대 사기 +{duel.moraleWin ?? 30} · 진 쪽 전군 사기 {duel.moraleLose ?? -8}
            </small>
          )}
        </div>
      )}
    </div>
  );
}

/** 사선 띠 컷인 (시안 .cut): 1.6초 */
function CutIn({ hz, title, sub }: { hz: string; title: string; sub?: string }) {
  return (
    <div className="cut3d on" role="status">
      <div className="band">
        <div className="ct">
          <b>{hz}</b>
          <span>{title}</span>
          {sub && <small>{sub}</small>}
        </div>
      </div>
    </div>
  );
}

/** 큰 사건 배너 표시 시간 / 자동 감속 시간 (설계서 10-2) */
const BANNER_MS = 1800;
const SLOW_MS = 3000;
/** 일기토 전 카메라가 두 장수 쪽으로 가는 시간 (설계서 9-3 ①) */
const PAN_MS = 500;

/** 사건 기록 색 구분 (설계서 10-3): 계책=먹색 굵게, 피해=주홍, 경사=금색 */
function logTone(line: string, mineNames: Set<string>, mine: 'atk' | 'def'): string {
  const starts = (t: string) => [...mineNames].some((n) => t.startsWith(n));
  if (/^(공격군|수비군) 승리/.test(line)) return line.startsWith(mine === 'atk' ? '공격군' : '수비군') ? 'lg-gain' : 'lg-loss';
  if (line.startsWith('일기토')) {
    // "일기토 A vs B: 승자가 패자를 베었다" / "패자가 달아났다" / "승부가 나지 않았다"
    const tail = line.slice(line.indexOf(':') + 2);
    if (tail.startsWith('승부')) return 'lg-stratagem';
    const subjMine = starts(tail);
    return /달아났다/.test(tail) === subjMine ? 'lg-loss' : 'lg-gain';
  }
  if (/^(성문|성벽)이 무너/.test(line)) return mine === 'atk' ? 'lg-gain' : 'lg-loss';
  if (/공격군의 군량/.test(line)) return mine === 'atk' ? 'lg-loss' : 'lg-gain';
  if (/전사|사로잡|패주|무너|퇴각|달아났|굶주림/.test(line)) return starts(line) ? 'lg-loss' : 'lg-gain';
  if (/화계|복병|계략|고무|간파|척하|내준다|혼란/.test(line)) return 'lg-stratagem';
  return '';
}
const SPEED_LABEL = ['', '1배', '2배', '4배'];
const TERRAIN_TILE: Record<Terrain, TileKind> = {
  plain: 'plain', forest: 'forest', mountain: 'mount', river: 'river', water: 'river', bridge: 'bridge', wall: 'wall', gate: 'gate', town: 'town', keep: 'camp',
};
const STATUS_NAME: Record<BUnit['status'], string> = { active: '건재', routed: '패주', captured: '포로', dead: '전사', retreated: '퇴각' };
const RETREAT_NAME = (v: number) => (v > 0 ? `${Math.round(v * 100)}%` : '끝까지');

/** 병종별 평균 이동 속도 (칸/틱, 엔진 SPEED와 같은 값) — 화면에서 부대를 연속으로 미끄러지게 할 때 쓴다 */
const KIND_SPEED: Record<BUnit['kind'], number> = { infantry: 0.34, cavalry: 0.5, archer: 0.3 };

/** 화면 연출 상태 (엔진 상태와 분리: 저장되지 않음) */
interface UnitFx {
  /** 화면에 그려지는 위치 (칸 단위, 소수) */
  x: number;
  y: number;
  /** 바라보는 방향 (1 = 오른쪽) */
  face: number;
  troops: number;
  atkCd: number;
  status: BUnit['status'];
  /** 걷기 흔들림 위상 */
  walk: number;
  /** 돌격 연출: 방향과 시작 시각 */
  lunge?: { dx: number; dy: number; t0: number };
  /** 피격 번쩍임 시작 시각 */
  hit?: number;
  /** 지금 떠 있는 피해 숫자 (연속 피해 합산용) */
  dmg?: FloatFx & { sum: number };
}
interface FloatFx {
  x: number;
  y: number;
  text: string;
  color: string;
  big?: boolean;
  t0: number;
}
interface ArrowFx {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t0: number;
}
const LUNGE_MS = 260;
const FLOAT_MS = 1100;
const ARROW_MS = 420;

export function BattleScreen() {
  const b = useStore((s) => s.battle)!;
  const [, setRev] = useState(0);
  if (b.auto && !b.started) return <WarCouncil b={b} onDone={() => setRev((r) => r + 1)} />;
  return <Spectate b={b} />;
}

// ───────────────────────────── 작전 회의 ─────────────────────────────

function WarCouncil({ b, onDone }: { b: BattleState; onDone: () => void }) {
  const mine = b.playerSide ?? 'atk';
  const enemy = mine === 'atk' ? 'def' : 'atk';
  const list = mine === 'atk' ? ATK_POLICIES : DEF_POLICIES;
  const [plan, setPlanState] = useState<SidePlan>(() => b.plans?.[mine] ?? defaultPlan(b, mine, mine === 'atk' ? 'atk_front' : 'def_hold'));
  const [confirm, setConfirm] = useState<null | 'watch' | 'skip'>(null);
  const [unitEdit, setUnitEdit] = useState<string | null>(null);
  const exec = executionOf(b, mine);
  const cmd = commanderOf(b, mine);
  const adv = advisorOf(b, mine);
  const myUnits = activeUnits(b, mine);
  const myTroops = myUnits.reduce((s, u) => s + u.troops, 0);
  const enTroops = activeUnits(b, enemy).reduce((s, u) => s + u.troops, 0);
  // 정찰 없음(1단계): 적 병력은 대략만 (천 단위)
  const enApprox = Math.max(1000, Math.round(enTroops / 1000) * 1000);
  const pol = POLICIES[plan.policy];
  const f = execFactor(exec, pol.reqExec);

  const choose = (id: PolicyId) => {
    if (!policyCheck(b, mine, id).ok) return;
    sfx('click');
    setPlanState(switchPolicy(plan, id));
  };
  const delegate = () => {
    const rng = rngOf(b);
    setPlanState(defaultPlan(b, mine, aiChoosePolicy(b, mine, () => rng.next())));
    sfx('click');
  };
  const go = (skip: boolean) => {
    setPlan(b, mine, plan);
    startPlannedBattle(b);
    if (skip) runPlannedBattle(b);
    sfx('battle');
    onDone();
  };
  const editU = myUnits.find((u) => u.id === unitEdit);
  const setUnit = (id: string, patch: Partial<UnitPlan>) => setPlanState({ ...plan, units: { ...plan.units, [id]: { ...plan.units[id]!, ...patch } } });

  return (
    <div className="screen council">
      <div className="council-head">
        <div>
          <div className="crumb">
            {b.cityName} {mine === 'atk' ? '공격' : '방어'} · 작전 회의
          </div>
          <div className="ttl">전군 방침을 정하십시오</div>
        </div>
        <div className="council-force num">
          <span>
            아군 <b>{fmt(myTroops)}</b>
          </span>
          <span>
            적군 <b>약 {fmt(enApprox)}</b>
          </span>
          <span className="dim">전력비 {(myTroops / Math.max(1, enTroops)).toFixed(2)}</span>
        </div>
      </div>

      <div className="council-body">
        <div className="policy-grid scroll" role="radiogroup" aria-label="전군 방침">
          {list.map((id) => {
            const p = POLICIES[id];
            const chk = policyCheck(b, mine, id);
            const pf = execFactor(exec, p.reqExec);
            return (
              <button key={id} role="radio" aria-checked={plan.policy === id} className={`policy ${plan.policy === id ? 'on' : ''}`} disabled={!chk.ok} onClick={() => choose(id)}>
                <span className="pc">{p.code}</span>
                <b>{p.name}</b>
                <span className="pd">{p.desc}</span>
                {p.ground && <span className="pd pg">{p.ground}</span>}
                <span className={`pe ${!chk.ok ? 'bad' : pf >= 1 ? 'good' : pf > 0 ? 'warn' : 'bad'}`}>
                  {!chk.ok ? chk.reason : `요구 실행도 ${p.reqExec}${pf >= 1 ? '' : pf > 0 ? ' · 조금 모자람' : ' · 크게 모자람'}`}
                </span>
              </button>
            );
          })}
        </div>

        <div className="council-side scroll">
          <div className="lbl">
            <span>{pol.name}</span>
            <span className={f >= 1 ? 'good' : f > 0 ? 'warn' : 'bad'}>
              실행도 {exec} / {pol.reqExec}
            </span>
          </div>
          <div className="small dim" style={{ lineHeight: 1.5 }}>
            강한 상대: {pol.strong}
            <br />
            약한 상대: {pol.weak}
            <br />
            총대장 {cmd?.name ?? '-'} · 군사 {adv?.name ?? '-'}
          </div>
          {f < 1 && (
            <div className="small" style={{ color: f > 0 ? 'var(--g-warn)' : 'var(--g-bad)' }}>
              {f > 0 ? '실행도가 조금 모자라 상성 효과가 줄어듭니다.' : '실행도가 크게 모자라 부대들이 따로 놀 수 있습니다. 더 단순한 방침을 권합니다.'}
            </div>
          )}
          <div className="lbl" style={{ marginTop: 4 }}>
            <span>부대 (누르면 바꾸기)</span>
          </div>
          {myUnits.map((u) => {
            const up = plan.units[u.id];
            if (!up) return null;
            return (
              <button key={u.id} className="council-unit" onClick={() => setUnitEdit(u.id)}>
                <Seal id={u.officer} name={u.name} faction={u.faction} size={26} />
                <span className="cu-name">
                  {u.name}
                  <small>
                    {KIND_NAME[u.kind]}{u.ram ? ' · 충차대' : ''} {fmt(u.troops)}
                  </small>
                </span>
                <span className="cu-tags">
                  <i>{ROLE_NAME[up.role]}</i>
                  <i>{STANCE_NAME[up.stance]}</i>
                  <i>퇴각 {RETREAT_NAME(up.retreatAt)}</i>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="council-foot">
        <Btn onClick={delegate}>군사에게 맡기기</Btn>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => setConfirm('skip')}>결과만 보기</Btn>
        <Btn kind="primary" style={{ minWidth: 168 }} onClick={() => setConfirm('watch')}>
          작전 확정 · 관전
        </Btn>
      </div>

      {editU && plan.units[editU.id] && (
        <Modal title={`${editU.name} 부대 설정`} onClose={() => setUnitEdit(null)} footer={<Btn kind="primary" onClick={() => setUnitEdit(null)}>확인</Btn>}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="set-row" style={{ border: 0, padding: 0 }}>
              <span>역할</span>
              <div className="seg">
                {ROLES.map((v) => (
                  <button key={v} className={plan.units[editU.id]!.role === v ? 'on' : ''} onClick={() => setUnit(editU.id, { role: v })}>
                    {ROLE_NAME[v]}
                  </button>
                ))}
              </div>
            </div>
            <div className="set-row" style={{ border: 0, padding: 0 }}>
              <span>태도</span>
              <div className="seg">
                {STANCES.map((v) => (
                  <button key={v} className={plan.units[editU.id]!.stance === v ? 'on' : ''} onClick={() => setUnit(editU.id, { stance: v })}>
                    {STANCE_NAME[v]}
                  </button>
                ))}
              </div>
            </div>
            <div className="set-row" style={{ border: 0, padding: 0 }}>
              <span>퇴각 기준</span>
              <div className="seg">
                {RETREAT_OPTIONS.map((v) => (
                  <button key={v} className={plan.units[editU.id]!.retreatAt === v ? 'on' : ''} onClick={() => setUnit(editU.id, { retreatAt: v })}>
                    {RETREAT_NAME(v)}
                  </button>
                ))}
              </div>
            </div>
            <div className="set-row" style={{ border: 0, padding: 0 }}>
              <span>일기토</span>
              <div className="seg">
                {(['seek', 'accept', 'refuse'] as const).map((v) => (
                  <button
                    key={v}
                    className={(plan.units[editU.id]!.duel ?? defaultDuelPolicy(editU.war)) === v ? 'on' : ''}
                    onClick={() => setUnit(editU.id, { duel: v })}
                    disabled={v === 'seek' && editU.war < 80}
                    title={v === 'seek' && editU.war < 80 ? '무력 80 이상만 먼저 신청합니다' : undefined}
                  >
                    {v === 'seek' ? '적극 신청' : v === 'accept' ? '받으면 수락' : '거절'}
                  </button>
                ))}
              </div>
            </div>
            <p className="small dim" style={{ margin: 0 }}>
              퇴각 기준: 병력이 처음의 이 비율 아래로 줄면 스스로 물러납니다. 태도 &lsquo;공격&rsquo;은 주고받는 피해가 늘고, &lsquo;신중&rsquo;은 줄어듭니다.
            </p>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title="작전을 확정합니까?"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Btn onClick={() => setConfirm(null)}>다시 생각한다</Btn>
              <Btn kind="primary" onClick={() => go(confirm === 'skip')}>
                {confirm === 'skip' ? '확정 · 결과만 보기' : '확정 · 관전'}
              </Btn>
            </>
          }
        >
          <p className="small" style={{ margin: 0, lineHeight: 1.6 }}>
            「{pol.name}」{josa(pol.name, '으로/로').slice(pol.name.length)} 싸웁니다. 확정하면 전투가 끝날 때까지 명령을 바꿀 수 없습니다.
          </p>
        </Modal>
      )}
    </div>
  );
}

// ───────────────────────────── 관전 ─────────────────────────────

function Spectate({ b }: { b: BattleState }) {
  const g = useGame();
  /** 일기토 무대에 넘길 장수 정보 (엔진 값: 이름·자·무력, 모형은 전장과 같은 얼굴) */
  const duelSide = (officer?: string): DuelSide => {
    const u = b.units.find((x) => x.officer === officer)!;
    const o = g.ix.officer.get(u.officer)!;
    return { name: u.name, zi: o.courtesy, war: u.war, desc: heroDesc(lookOf(u)), fc: factionColor(u.faction), ch: sealChar(u.officer, u.name), portrait: stage3.current?.portrait(u.id) ?? null };
  };
  /** 3D 명장 모형: 2D 초상과 같은 얼굴 데이터를 넘긴다 */
  const lookOf = (u: BUnit): HeroLookInput => {
    const o = g.ix.officer.get(u.officer)!;
    return { id: u.officer, ch: sealChar(u.officer, u.name), war: u.war, intelligence: u.int, age: g.s.year - o.birthYear, factionColor: factionColor(u.faction), face: faceOf(o) as HeroLookInput['face'] };
  };
  const finishBattle = useStore((s) => s.finishBattle);
  const defaultSpeed = useSettings((s) => s.battleSpeed);
  const view = useViewSize();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [speed, setSpeed] = useState<number>(b.result ? 0 : defaultSpeed);
  const [, setFrame] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [saveModal, setSaveModal] = useState<'save' | 'load' | null>(null);
  const [menu, setMenu] = useState(false);
  const lastSpeed = useRef<number>(defaultSpeed || 1);
  const cam = useRef<{ cs: number; ox: number; oy: number } | null>(null);
  const ptr = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const mine = b.playerSide ?? 'atk';
  const enemySide = mine === 'atk' ? 'def' : 'atk';
  const selUnit = b.units.find((u) => u.id === sel) ?? null;
  /** 재생 중인 일기토 (b.duels 인덱스), 카메라 이동 중인 일기토 */
  const [duelIdx, setDuelIdx] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const [banner, setBanner] = useState<{ text: string; tone: string; id: number } | null>(null);
  const bannerQ = useRef<{ text: string; tone: string }[]>([]);
  const slowUntil = useRef(0);
  /** 3D 일기토 진행 상태 (전장 위에서 재생) */
  const [duel3d, setDuel3d] = useState<{ idx: number; round: number; phase: 'intro' | 'fight' | 'result' } | null>(null);
  // 일기토 장면이 열려 있는 동안 일기토 곡 (음향_BGM_큐시트 2장 ②)
  useEffect(() => {
    setBgmDuel(duel3d !== null || duelIdx !== null);
    return () => setBgmDuel(false);
  }, [duel3d, duelIdx]);
  /**
   * 종료 연출: 승패가 정해져도 결과창을 바로 띄우지 않는다. 승패 배너와 함께 패군이 무너져 물러나는 모습을
   * OUTRO_MS 동안 보여 준 뒤 결과창을 연다. "결과만 보기"나 결과가 난 채 불러온 전투는 바로 결과창.
   */
  const [outro, setOutro] = useState<'none' | 'play' | 'done'>(b.result ? 'done' : 'none');
  const running = speed > 0 && !saveModal && !b.result && duelIdx === null && !panning && !duel3d;

  const fit = () => {
    const cs = Math.min(view.w / b.w, (view.h - 8) / b.h);
    return { cs, ox: (view.w - cs * b.w) / 2, oy: (view.h - cs * b.h) / 2 };
  };
  if (!cam.current) cam.current = fit();
  const fx = useRef(new Map<string, UnitFx>());
  const floats = useRef<FloatFx[]>([]);
  const arrows = useRef<ArrowFx[]>([]);
  const lastDraw = useRef(0);
  const drawRef = useRef<() => void>(() => {});
  // 3D 전장이면 2D 판은 그리지 않는다
  drawRef.current = () => (CAN_3D ? undefined : draw());
  const stage3 = useRef<BattleStage | null>(null);
  const getStage3 = useRef(() => stage3.current).current;
  const redraw = () => requestAnimationFrame(() => drawRef.current());

  // 진행 중일 때만 그린다. 멈추면 그리기도 멈춘다 (배터리)
  useEffect(() => {
    if (!running) {
      stage3.current?.setTps(0);
      redraw();
      return;
    }
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let uiAcc = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // 큰 사건 직후 3초는 1배속으로 (설계서 10-2)
      const tps = now < slowUntil.current ? Math.min(TPS[speed] ?? 0, TPS[1]!) : (TPS[speed] ?? 0);
      stage3.current?.setTps(tps);
      acc += dt * tps;
      const n = Math.floor(acc);
      if (n > 0) {
        acc -= n;
        // 한 틱씩 진행해서 사건이 생기면 바로 멈출 수 있게 한다
        for (let i = 0; i < n && !b.result; i++) {
          advanceBattle(b, 1, true);
          if (takeCinematics(now)) {
            acc = 0;
            break;
          }
        }
        if (duelPending.current !== null) {
          drawRef.current();
          return; // 일기토: 루프를 멈추고 카메라 이동 → 장면
        }
      }
      drawRef.current();
      uiAcc += dt;
      if (uiAcc > 0.25) {
        uiAcc = 0;
        setFrame((f) => f + 1);
      }
      if (!b.result) raf = requestAnimationFrame(loop);
      else {
        // 승패 확정: 배너 + 종료 연출로 넘어간다
        const won = b.result.winner === mine;
        bannerQ.current.push({ text: won ? `승리 — ${b.result.reason}` : `패배 — ${b.result.reason}`, tone: won ? 'gain' : 'loss' });
        setOutro('play');
        setFrame((f) => f + 1);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, speed, b]);

  useEffect(() => {
    if (outro !== 'play') return;
    stage3.current?.setTps(TPS[1]!); // 패군이 물러나는 움직임은 1배속으로 보여 준다
    const t = setTimeout(() => setOutro('done'), OUTRO_MS);
    return () => clearTimeout(t);
  }, [outro]);

  // 일기토 직전 카메라 이동 (0.5초) 후 장면을 연다
  const duelPending = useRef<number | null>(null);
  function takeCinematics(now: number): boolean {
    const q = b.cinematics;
    while (q?.length) {
      const c = q.shift()!;
      if (c.kind === 'duel') {
        if (!b.duels[c.duel]) continue;
        duelPending.current = c.duel;
        startPan(c.duel);
        return true;
      }
      const mineSide = c.side === undefined ? null : c.side === mine;
      const tone = c.tone === 'stratagem' ? 'stratagem' : c.tone === 'neutral' ? '' : mineSide === null ? '' : (c.tone === 'loss') === mineSide ? 'loss' : 'gain';
      bannerQ.current.push({ text: c.text, tone });
      slowUntil.current = now + SLOW_MS;
    }
    return false;
  }
  function startPan(idx: number) {
    const d = b.duels[idx]!;
    const ua = b.units.find((u) => u.officer === d.aId);
    const ub = b.units.find((u) => u.officer === d.bId);
    const c = cam.current!;
    setPanning(true);
    if (CAN_3D && stage3.current && ua && ub) {
      // 3D: 一騎討 컷인(두 장수 초상) → 전장을 멈추고 일기토 전용 무대 → 전장으로 돌아와 결과·사기 변화
      duelPending.current = null;
      setPanning(false);
      setDuel3d({ idx, round: -1, phase: 'intro' });
      setTimeout(() => setDuel3d((d) => d && { ...d, phase: 'fight' }), 1400);
      return;
    }
    if (ua && ub) {
      const mx = ((ua.x + ub.x) / 2 + 0.5) * c.cs;
      const my = ((ua.y + ub.y) / 2 + 0.5) * c.cs;
      const from = { ox: c.ox, oy: c.oy };
      const to = { ox: view.w / 2 - mx, oy: view.h / 2 - my };
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / PAN_MS);
        const e = p * (2 - p);
        c.ox = from.ox + (to.ox - from.ox) * e;
        c.oy = from.oy + (to.oy - from.oy) * e;
        drawRef.current();
        if (p < 1) requestAnimationFrame(step);
        else openDuel();
      };
      requestAnimationFrame(step);
    } else setTimeout(openDuel, PAN_MS);
  }
  function openDuel() {
    const idx = duelPending.current;
    duelPending.current = null;
    setPanning(false);
    setDuelIdx(idx);
  }
  // 배너: 한 번에 하나씩 1.8초
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [banner]);
  useEffect(() => {
    if (banner) return;
    const next = bannerQ.current.shift();
    if (next) setBanner({ ...next, id: performance.now() });
  });

  useEffect(() => {
    setSpriteLoadListener(() => redraw());
    return () => setSpriteLoadListener(null);
  });
  useEffect(() => {
    if (!running) redraw();
  });
  // 폰에서 앱이 뒤로 가면 전투를 멈춘다
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) return;
      setSpeed((s) => {
        if (s) lastSpeed.current = s;
        return 0;
      });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
      } else if (e.key === '1' || e.key === '2' || e.key === '3') setSpeed(Number(e.key));
      else if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const togglePause = () =>
    setSpeed((s) => {
      if (s === 0) return lastSpeed.current || 1;
      lastSpeed.current = s;
      return 0;
    });
  const local = (e: React.PointerEvent | React.WheelEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * view.w, y: ((e.clientY - r.top) / r.height) * view.h };
  };
  const cellAt = (lx: number, ly: number) => {
    const c = cam.current!;
    return { x: Math.floor((lx - c.ox) / c.cs), y: Math.floor((ly - c.oy) / c.cs) };
  };
  /** 적 복병은 드러나기 전까지 보이지 않는다 */
  const visible = (u: BUnit) => u.status === 'active' && (!u.hidden || u.side === mine);
  const commanders = new Set([b.plans?.atk?.commander, b.plans?.def?.commander].filter(Boolean) as string[]);

  /** 공격한 부대가 노린 적: 지정 목표가 있으면 그것, 없으면 사거리 안 가장 가까운 적 */
  const targetOf = (u: BUnit): BUnit | null => {
    if (u.order.type === 'attack') {
      const id = u.order.target;
      const t = b.units.find((v) => v.id === id);
      if (t && t.status === 'active') return t;
    }
    let best: BUnit | null = null;
    let bd = 99;
    for (const v of b.units) {
      if (v.side === u.side || v.status !== 'active' || v.hidden) continue;
      const d = Math.max(Math.abs(v.x - u.x), Math.abs(v.y - u.y));
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return bd <= 4 ? best : null;
  };

  /** 엔진 상태와 화면 연출 상태를 맞춘다: 위치는 병종 속도로 연속 이동, 공격·피해·패주는 연출을 띄운다 */
  function updateFx(now: number, dt: number) {
    const tps = running ? TPS[speed] ?? 0 : 0;
    for (const u of b.units) {
      let f = fx.current.get(u.id);
      if (!f) {
        f = { x: u.x, y: u.y, face: u.side === 'atk' ? 1 : -1, troops: u.troops, atkCd: u.atkCd, status: u.status, walk: 0 };
        fx.current.set(u.id, f);
        continue;
      }
      // 이동: 목표 칸까지 병종 속도로 미끄러진다 (뒤처지면 조금 더 빨리 따라간다)
      const dx = u.x - f.x;
      const dy = u.y - f.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 3 || tps === 0) {
        f.x = u.x;
        f.y = u.y;
      } else if (dist > 0.001) {
        const v = Math.max(0.5, KIND_SPEED[u.kind] * tps) * (1 + Math.max(0, dist - 0.6) * 1.5);
        const step = Math.min(dist, v * dt);
        f.x += (dx / dist) * step;
        f.y += (dy / dist) * step;
        f.walk += step * Math.PI * 2;
        if (Math.abs(dx) > 0.05) f.face = dx > 0 ? 1 : -1;
      }
      // 공격: 쿨다운이 다시 채워졌으면 이번 틱에 공격한 것
      if (u.status === 'active' && u.atkCd > f.atkCd) {
        const t = targetOf(u);
        if (t) {
          const tx = t.x - u.x;
          const ty = t.y - u.y;
          const td = Math.max(0.001, Math.hypot(tx, ty));
          if (Math.abs(tx) > 0.05) f.face = tx > 0 ? 1 : -1;
          if (u.kind === 'archer' && td > 1.5) arrows.current.push({ x0: f.x, y0: f.y, x1: t.x, y1: t.y, t0: now });
          else f.lunge = { dx: tx / td, dy: ty / td, t0: now };
        }
      }
      f.atkCd = u.atkCd;
      // 피해 숫자
      const loss = f.troops - u.troops;
      if (loss > 0 && (u.side === mine || !u.hidden)) {
        // 짧은 시간에 여러 번 맞으면 숫자 하나로 합친다 (난전에서 숫자가 쌓여 이름표를 가리지 않게)
        const prev = f.dmg && now - f.dmg.t0 < 700 ? f.dmg : null;
        if (prev) {
          prev.sum += loss;
          prev.text = `-${fmt(prev.sum)}`;
          prev.x = f.x;
          prev.y = f.y;
        } else {
          const p = { x: f.x, y: f.y, text: `-${fmt(loss)}`, color: tokenValue(u.side === mine ? '--g-bad' : '--g-warn'), t0: now, sum: loss };
          floats.current.push(p);
          f.dmg = p;
        }
        f.hit = now;
      }
      f.troops = u.troops;
      // 패주·포로·전사
      if (u.status !== f.status && f.status === 'active') {
        const word = u.status === 'captured' ? '포로!' : u.status === 'dead' ? '전사!' : u.status === 'retreated' ? '퇴각' : '패주!';
        floats.current.push({ x: f.x, y: f.y - 0.4, text: `${u.name} ${word}`, color: tokenValue('--g-gold'), big: true, t0: now });
      }
      f.status = u.status;
    }
    floats.current = floats.current.filter((p) => now - p.t0 < FLOAT_MS * (p.big ? 2 : 1));
    arrows.current = arrows.current.filter((a) => now - a.t0 < ARROW_MS);
  }

  function draw() {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(view.w * view.scale * dpr);
    const H = Math.round(view.h * view.scale * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const x = cv.getContext('2d')!;
    x.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, 0, 0);
    const c = cam.current!;
    const cs = c.cs;
    x.fillStyle = tokenValue('--g-lacquer-3');
    x.fillRect(0, 0, view.w, view.h);
    for (let ty = 0; ty < b.h; ty++)
      for (let tx = 0; tx < b.w; tx++) {
        const t = b.tiles[ty * b.w + tx]!;
        const px = c.ox + tx * cs;
        const py = c.oy + ty * cs;
        const img = tileSprite(TERRAIN_TILE[t.t]);
        if (img.complete) x.drawImage(img, px, py, cs + 0.5, cs + 0.5);
        if ((t.t === 'wall' || t.t === 'gate') && t.hp !== undefined) {
          x.fillStyle = 'rgba(0,0,0,.6)';
          x.fillRect(px + cs * 0.12, py + cs * 0.82, cs * 0.76, 3);
          x.fillStyle = tokenValue('--g-warn');
          x.fillRect(px + cs * 0.12, py + cs * 0.82, cs * 0.76 * Math.min(1, t.hp / 1800), 3);
        }
        if (t.t === 'keep') {
          x.fillStyle = tokenValue('--g-cinnabar');
          x.font = `900 ${cs * 0.5}px "Noto Serif KR", serif`;
          x.textAlign = 'center';
          x.fillText('本', px + cs / 2, py + cs * 0.68);
          x.textAlign = 'left';
        }
        if (t.fire) {
          const gx = px + cs / 2;
          const gy = py + cs / 2;
          const gr = x.createRadialGradient(gx, gy, 2, gx, gy, cs * 0.6);
          gr.addColorStop(0, 'rgba(255,170,60,.9)');
          gr.addColorStop(1, 'rgba(181,56,42,0)');
          x.fillStyle = gr;
          x.beginPath();
          x.arc(gx, gy, cs * 0.6, 0, Math.PI * 2);
          x.fill();
        }
      }
    const now = performance.now();
    const dt = lastDraw.current ? Math.min(0.1, (now - lastDraw.current) / 1000) : 0;
    lastDraw.current = now;
    updateFx(now, dt);
    // 화살
    for (const a of arrows.current) {
      const p = (now - a.t0) / ARROW_MS;
      const ax = c.ox + (a.x0 + (a.x1 - a.x0) * p + 0.5) * cs;
      const ay = c.oy + (a.y0 + (a.y1 - a.y0) * p + 0.5) * cs - Math.sin(p * Math.PI) * cs * 0.8;
      const ang = Math.atan2(a.y1 - a.y0, a.x1 - a.x0);
      x.strokeStyle = tokenValue('--g-text');
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(ax - Math.cos(ang) * cs * 0.3, ay - Math.sin(ang) * cs * 0.3);
      x.lineTo(ax, ay);
      x.stroke();
    }
    // 아래쪽 부대부터 그려서 겹칠 때 자연스럽게
    const order = b.units.filter(visible).sort((p, q) => (fx.current.get(p.id)?.y ?? p.y) - (fx.current.get(q.id)?.y ?? q.y));
    const plates: (() => void)[] = [];
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (const u of order) {
      const f = fx.current.get(u.id)!;
      let px = f.x;
      let py = f.y;
      if (f.lunge) {
        const p = (now - f.lunge.t0) / LUNGE_MS;
        if (p >= 1) f.lunge = undefined;
        else {
          const k = Math.sin(p * Math.PI) * 0.32;
          px += f.lunge.dx * k;
          py += f.lunge.dy * k;
        }
      }
      const bob = Math.abs(Math.sin(f.walk)) * cs * 0.06;
      const cx = c.ox + (px + 0.5) * cs;
      const cy = c.oy + (py + 0.5) * cs - bob;
      const sz = cs * 1.18;
      // 발밑 그림자
      x.fillStyle = 'rgba(0,0,0,.28)';
      x.beginPath();
      x.ellipse(cx, cy + bob + cs * 0.36, cs * 0.36, cs * 0.12, 0, 0, Math.PI * 2);
      x.fill();
      if (u.id === sel) {
        x.strokeStyle = tokenValue('--g-gold');
        x.lineWidth = 2.5;
        x.beginPath();
        x.arc(cx, cy, cs * 0.62, 0, Math.PI * 2);
        x.stroke();
      }
      x.globalAlpha = u.hidden ? 0.45 : 1;
      const img = unitSprite(factionColor(u.faction), sealChar(u.officer, u.name), u.kind, f.face < 0, u.confused > 0);
      if (img.complete) x.drawImage(img, cx - sz / 2, cy - sz / 2 - cs * 0.04, sz, (sz * 118) / 120);
      // 피격 번쩍임
      if (f.hit && now - f.hit < 180) {
        x.globalAlpha = 0.45 * (1 - (now - f.hit) / 180);
        x.fillStyle = '#ffffff';
        x.beginPath();
        x.arc(cx, cy, cs * 0.5, 0, Math.PI * 2);
        x.fill();
      }
      x.globalAlpha = 1;
      const bw = cs * 0.8;
      x.fillStyle = 'rgba(0,0,0,.55)';
      x.fillRect(cx - bw / 2, cy + cs * 0.4, bw, 4);
      x.fillStyle = tokenValue(u.side === mine ? '--g-good' : '--g-bad');
      x.fillRect(cx - bw / 2, cy + cs * 0.4, bw * (u.troops / Math.max(1, u.startTroops)), 4);
      // 장수 이름표: 세력색 띠 + 이름 (총대장은 帥, 금테)
      plates.push(() => {
        const isCmd = commanders.has(u.id);
        const label = (isCmd ? '帥 ' : '') + u.name;
        const fs = Math.max(10, cs * 0.4);
        x.font = `800 ${fs}px "Noto Sans KR", sans-serif`;
        const tw = x.measureText(label).width + 8;
        const th = fs + 4;
        const lx = cx - tw / 2;
        // 이웃 부대 이름표와 겹치면 발밑 → 더 위 순서로 비켜 선다
        const cands = [cy - sz / 2 - th + cs * 0.02, cy + cs * 0.5, cy - sz / 2 - th * 2 + cs * 0.02];
        const hits = (yy: number) => placed.some((r) => lx < r.x + r.w && lx + tw > r.x && yy < r.y + r.h && yy + th > r.y);
        const ly = cands.find((yy) => !hits(yy)) ?? cands[0]!;
        placed.push({ x: lx, y: ly, w: tw, h: th });
        x.globalAlpha = 0.92;
        x.fillStyle = factionColor(u.faction);
        x.fillRect(lx, ly, tw, th);
        x.globalAlpha = 1;
        x.strokeStyle = isCmd || u.id === sel ? tokenValue('--g-gold') : 'rgba(0,0,0,.55)';
        x.lineWidth = isCmd || u.id === sel ? 1.5 : 1;
        x.strokeRect(lx + 0.5, ly + 0.5, tw - 1, th - 1);
        x.fillStyle = '#fff';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.shadowColor = 'rgba(0,0,0,.7)';
        x.shadowBlur = 2;
        x.fillText(label, cx, ly + th / 2 + 0.5);
        x.shadowBlur = 0;
        x.textBaseline = 'alphabetic';
        x.textAlign = 'left';
      });
      const tag = u.hidden ? '伏' : u.confused ? '混' : u.order.type === 'retreat' ? '退' : null;
      if (tag) {
        x.fillStyle = tokenValue('--g-lacquer-solid');
        x.fillRect(cx + cs * 0.22, cy + cs * 0.12, cs * 0.3, cs * 0.3);
        x.strokeStyle = tokenValue('--g-gold');
        x.lineWidth = 1;
        x.strokeRect(cx + cs * 0.22, cy + cs * 0.12, cs * 0.3, cs * 0.3);
        x.fillStyle = tokenValue('--g-text');
        x.font = `900 ${cs * 0.22}px "Noto Serif KR", serif`;
        x.textAlign = 'center';
        x.fillText(tag, cx + cs * 0.37, cy + cs * 0.35);
        x.textAlign = 'left';
      }
    }
    // 이름표는 부대 위에 한 번 더 (다른 부대 그림에 가려지지 않게)
    for (const p of plates) p();
    // 떠오르는 숫자·알림
    x.textAlign = 'center';
    for (const p of floats.current) {
      const life = FLOAT_MS * (p.big ? 2 : 1);
      const t = (now - p.t0) / life;
      const fs = p.big ? Math.max(14, cs * 0.6) : Math.max(9, cs * 0.36);
      x.font = `900 ${fs}px "Noto Sans KR", sans-serif`;
      x.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      // 피해 숫자는 부대 오른쪽 옆에서 떠올라 이름표를 가리지 않는다
      const fx0 = c.ox + (p.x + (p.big ? 0.5 : 1.05)) * cs;
      const fy0 = c.oy + (p.y + (p.big ? 0.1 : 0.55)) * cs - t * cs * (p.big ? 0.6 : 0.7);
      x.lineWidth = 3;
      x.strokeStyle = 'rgba(0,0,0,.75)';
      x.strokeText(p.text, fx0, fy0);
      x.fillStyle = p.color;
      x.fillText(p.text, fx0, fy0);
    }
    x.globalAlpha = 1;
    x.textAlign = 'left';
    if (b.weather === 'rain') {
      x.strokeStyle = 'rgba(238,232,215,.35)';
      x.lineWidth = 1;
      for (let i = 0; i < 90; i++) {
        const rx = (i * 97 + (running ? now / 3 : 0)) % view.w;
        const ry = (i * 53 + (running ? now / 2 : 0)) % view.h;
        x.beginPath();
        x.moveTo(rx, ry);
        x.lineTo(rx - 4, ry + 10);
        x.stroke();
      }
    }
    const gr = x.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.45, view.w / 2, view.h / 2, view.w * 0.7);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,.42)');
    x.fillStyle = gr;
    x.fillRect(0, 0, view.w, view.h);
  }

  const mineNames = new Set(b.units.filter((u) => u.side === mine).map((u) => u.name));
  const sum = (side: 'atk' | 'def') => activeUnits(b, side).reduce((s, u) => s + u.troops, 0);
  const morale = (side: 'atk' | 'def') => {
    const us = activeUnits(b, side);
    return us.length ? Math.round(us.reduce((s, u) => s + u.morale, 0) / us.length) : 0;
  };
  const meSum = sum(mine);
  const enSum = sum(enemySide);
  const myFaction = b.units.find((u) => u.side === mine)?.faction ?? g.s.playerFaction;
  const enFaction = b.units.find((u) => u.side === enemySide)?.faction ?? null;
  const myPolicy = b.plans?.[mine]?.policy;
  const weather = b.weather === 'clear' ? '맑음' : b.weather === 'cloudy' ? '흐림' : '비';
  const half = b.tick % TICKS_PER_DAY < TICKS_PER_DAY / 2 ? '낮' : '밤';
  const selPlan = selUnit && selUnit.side === mine ? b.plans?.[mine]?.units[selUnit.id] : undefined;

  return (
    <div className="screen">
      {CAN_3D ? (
        <>
          <Scene3D
            makeStage={() => (stage3.current = new BattleStage(b, mine, factionColor, lookOf))}
            onReady={() => setFrame((f) => f + 1)}
            quality={QUALITY_3D}
            season={seasonOf(g.s.month)}
            paused={duel3d?.phase === 'fight' || !!saveModal || duelIdx !== null || (!!b.result && outro !== 'play') || (speed === 0 && !panning && outro !== 'play')}
            input={{
              onTap: (ndc) => {
                const cell = stage3.current?.pickCell(ndc);
                const u = cell && b.units.find((v) => visible(v) && Math.abs(v.x - cell[0]) <= 0 && Math.abs(v.y - cell[1]) <= 0);
                setSel(u ? u.id : null);
              },
            }}
          />
          {!duel3d && <SquadLabels b={b} stage={getStage3} mine={mine} sel={sel} commanders={commanders} />}
          {!duel3d && <SiegeBars stage={getStage3} />}
        </>
      ) : (
        <canvas
          ref={canvas}
          className="battle-canvas"
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture(e.pointerId);
            const q = local(e);
            ptr.current = { x: q.x, y: q.y, moved: false };
          }}
          onPointerMove={(e) => {
            const p = ptr.current;
            if (!p) return;
            const q = local(e);
            if (!p.moved && Math.hypot(q.x - p.x, q.y - p.y) > 6) p.moved = true;
            if (p.moved) {
              cam.current!.ox += q.x - p.x;
              cam.current!.oy += q.y - p.y;
              p.x = q.x;
              p.y = q.y;
              redraw();
            }
          }}
          onPointerUp={(e) => {
            const p = ptr.current;
            ptr.current = null;
            if (p && !p.moved) {
              const cell = cellAt(local(e).x, local(e).y);
              const u = b.units.find((v) => visible(v) && v.x === cell.x && v.y === cell.y);
              setSel(u ? u.id : null);
              redraw();
            }
          }}
          onWheel={(e) => {
            const q = local(e);
            const c = cam.current!;
            const base = fit().cs;
            const ncs = Math.max(base * 0.8, Math.min(base * 2.4, c.cs * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
            c.ox = q.x - ((q.x - c.ox) * ncs) / c.cs;
            c.oy = q.y - ((q.y - c.oy) * ncs) / c.cs;
            c.cs = ncs;
            redraw();
          }}
          onContextMenu={(e) => e.preventDefault()}
        />
      )}

      <div className="hud" style={{ left: 'var(--sa)', top: 10, width: 220, display: 'grid', gap: 4, fontSize: 'var(--fs-micro)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="good">
            {g.s.factions[myFaction ?? '']?.name ?? '아군'} {fmt(meSum)}
          </span>
          <span className="warn">
            {enFaction ? g.s.factions[enFaction]?.name : '적군'} {fmt(enSum)}
          </span>
        </div>
        <div className="forcebar">
          <i style={{ flex: Math.max(1, meSum), background: factionColor(myFaction) }} />
          <i style={{ flex: Math.max(1, enSum), background: factionColor(enFaction) }} />
        </div>
        <div className="dim" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>사기 {morale(mine)}</span>
          <span>
            {b.day}/{b.maxDays}일 {half}
          </span>
          <span>사기 {morale(enemySide)}</span>
        </div>
        <div style={{ borderTop: '1px solid var(--g-line-soft)', paddingTop: 3 }}>
          <span className="dim">우리 작전 </span>
          <b>{myPolicy ? POLICIES[myPolicy].name : '-'}</b>
          <span className="dim"> · 적 작전은 끝나면 공개</span>
        </div>
      </div>

      <div className="abs" style={{ left: '50%', top: 10, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 5 }}>
        <span className="pausetag" style={speed ? { background: 'var(--g-lacquer-3)' } : undefined}>
          {speed === 0 ? '일시정지' : `관전 ${SPEED_LABEL[speed]}`}
        </span>
        {[1, 2, 3].map((s) => (
          <Btn key={s} small kind={speed === s ? 'primary' : undefined} onClick={() => setSpeed(s)}>
            {SPEED_LABEL[s]}
          </Btn>
        ))}
      </div>

      <div className="abs" style={{ right: 'var(--sa)', top: 10, display: 'flex', alignItems: 'center', gap: 6, zIndex: 5 }}>
        <span className="dim micro" style={{ background: 'var(--g-lacquer)', padding: '5px 8px', borderRadius: 3 }}>
          {weather}
          {b.fireBoost ? ' · 동남풍' : ''}
        </span>
        <Btn small onClick={() => setMenu(!menu)}>
          設
        </Btn>
      </div>
      {menu && (
        <div className="hud" style={{ right: 'var(--sa)', top: 54, display: 'grid', gap: 6, width: 200, zIndex: 8 }}>
          <Btn small disabled={!!b.result} onClick={() => (setMenu(false), setSaveModal('save'))}>
            저장
          </Btn>
          <Btn small onClick={() => (setMenu(false), setSaveModal('load'))}>
            불러오기
          </Btn>
        </div>
      )}

      {selUnit && !menu && (
        <div className="hud sel" style={{ right: 'var(--sa)', top: 54, width: 222, display: 'grid', gap: 3, fontSize: 'var(--fs-micro)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Portrait officerId={selUnit.officer} name={selUnit.name} faction={selUnit.faction} size={30} />
            <span>
              <span className="disp" style={{ fontSize: 16 }}>
                {selUnit.name}
              </span>{' '}
              <span className="dim">{KIND_NAME[selUnit.kind]}{selUnit.ram ? ' · 충차대' : ''}</span>
              <br />
              <span className="num">
                {fmt(selUnit.troops)} / {fmt(selUnit.startTroops)} · 사기 {Math.round(selUnit.morale)}
              </span>
            </span>
          </div>
          {selPlan && (
            <div className="dim">
              {ROLE_NAME[selPlan.role]} · {STANCE_NAME[selPlan.stance]} · 퇴각 {RETREAT_NAME(selPlan.retreatAt)}
            </div>
          )}
          <div className="dim">
            {STATUS_NAME[selUnit.status]}
            {selUnit.hidden ? ' · 매복 중' : ''}
          </div>
        </div>
      )}

      {/* 왼쪽 아래: 멈춤 + 아군 부대 (명령 버튼은 없다: 관전 중 개입 없음) */}
      <div className="abs ulist" style={{ left: 'var(--sa)', bottom: 12, zIndex: 5 }}>
        <button className="sbtn" style={{ width: 56, height: 56, borderColor: speed === 0 ? 'var(--g-cinnabar)' : undefined }} onClick={togglePause} aria-label={speed === 0 ? '계속 보기' : '멈추기'}>
          <b>{speed === 0 ? '進' : '止'}</b>
          <span>{speed === 0 ? '계속' : '멈추기'}</span>
        </button>
        {b.units
          .filter((u) => u.side === mine)
          .map((u) => (
            <button key={u.id} className={`ucell ${u.id === sel ? 'sel' : ''} ${u.status !== 'active' ? 'gone' : ''}`} onClick={() => setSel(u.id)} aria-label={`${u.name} ${STATUS_NAME[u.status]}`}>
              {CAN_3D && stage3.current ? (
                <img className="chip3d" src={stage3.current.portrait(u.id) ?? undefined} alt="" width={30} height={30} />
              ) : (
                <Portrait officerId={u.officer} name={u.name} faction={u.faction} size={26} />
              )}
              <span className="ucell-name">{u.name}</span>
              <Bar value={u.troops} max={u.startTroops} tone="good" />
            </button>
          ))}
      </div>

      {banner && CAN_3D && cutHz(banner.text) ? (
        <CutIn key={banner.id} hz={cutHz(banner.text)!} title={banner.text} />
      ) : (
        banner && (
          <div key={banner.id} className={`battle-banner ${banner.tone}`} role="status">
            {banner.text}
          </div>
        )
      )}
      <div className="abs battle-log" aria-live="polite">
        {b.log.slice(-6).map((l, i) => (
          <div key={b.log.length - 6 + i} className={logTone(l, mineNames, mine)}>
            {l}
          </div>
        ))}
      </div>
      {duel3d?.phase === 'fight' && b.duels[duel3d.idx] && (
        <DuelScene3D
          duel={b.duels[duel3d.idx]!}
          a={duelSide(b.duels[duel3d.idx]!.aId)}
          b={duelSide(b.duels[duel3d.idx]!.bId)}
          onEnd={() => {
            setDuel3d((d) => d && { ...d, phase: 'result' });
            setTimeout(() => setDuel3d(null), 2200);
          }}
        />
      )}
      {duel3d && duel3d.phase !== 'fight' && b.duels[duel3d.idx] && (
        <Duel3DOverlay duel={b.duels[duel3d.idx]!} state={duel3d} portrait={(officer) => {
          const u = b.units.find((x) => x.officer === officer);
          return u ? stage3.current?.portrait(u.id) ?? null : null;
        }} />
      )}
      {duelIdx !== null && b.duels[duelIdx] && (
        <DuelScene
          duel={b.duels[duelIdx]!}
          onDone={() => {
            setDuelIdx(null);
            stage3.current?.resetFocus();
          }}
        />
      )}
      {!b.result && (
        <Btn
          className="abs"
          style={{ right: 'var(--sa)', bottom: 12, zIndex: 5 }}
          onClick={() => {
            runPlannedBattle(b);
            setOutro('done');
            b.cinematics = [];
            bannerQ.current = [];
            setBanner(null);
            setFrame((f) => f + 1);
          }}
        >
          결과만 보기
        </Btn>
      )}

      {saveModal && <SaveLoadModal mode={saveModal} onClose={() => setSaveModal(null)} />}
      {b.result && outro === 'done' && <BattleResult b={b} onDone={finishBattle} />}
    </div>
  );
}

// ───────────────────────────── 결과 보고서 ─────────────────────────────

function BattleResult({ b, onDone }: { b: BattleState; onDone: () => void }) {
  const g = useGame();
  const mine = b.playerSide ?? 'atk';
  const rep = battleReport(b, mine);
  const r = b.result!;
  const f = g.s.factions[g.s.playerFaction]!;
  const when = `${eraLabel(g.s.year, campOf(f.id, f.ruler))} ${['봄', '봄', '봄', '여름', '여름', '여름', '가을', '가을', '가을', '겨울', '겨울', '겨울'][g.s.month - 1]}`;
  const lead = (side: 'atk' | 'def') => [...b.units.filter((u) => u.side === side)].sort((a, c) => c.startTroops - a.startTroops)[0];
  const wl = lead(r.winner);
  const ll = lead(r.winner === 'atk' ? 'def' : 'atk');
  const sentence =
    r.winner === 'atk'
      ? `「${when}, ${josa(wl?.name ?? '공격군', '이/가')} ${josa(b.cityName, '을/를')} 쳐서 ${josa(ll?.name ?? '수비군', '을/를')} 몰아내고 성을 얻었다.」`
      : `「${when}, ${josa(wl?.name ?? '수비군', '이/가')} ${josa(b.cityName, '을/를')} 굳게 지켜 ${ll?.name ?? '적'}의 군세를 물리쳤다.」`;
  const tone = rep.matchup.startsWith('▲') ? 'good' : rep.matchup.startsWith('▼') ? 'bad' : 'dim';
  const [replay, setReplay] = useState<number | null>(null);
  return (
    <div className="screen result-screen" style={{ zIndex: 28 }}>
      {replay !== null && b.duels[replay] && <DuelScene duel={b.duels[replay]!} replay onDone={() => setReplay(null)} />}
      <div className="abs" style={{ left: 'var(--sa)', top: 22 }}>
        <div className={`big-seal ${rep.win ? '' : 'lose'}`}>{rep.win ? '勝' : '敗'}</div>
      </div>
      <div className="abs result-body scroll">
        <div className="disp" style={{ fontSize: 24 }}>
          {b.cityName} 싸움 · {rep.win ? '승리' : '패배'} <span className="dim small">({rep.reason})</span>
        </div>
        <div className="trio num" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div>
            <span>아군 손실</span>
            <b>{fmt(rep.myLoss)}</b>
          </div>
          <div>
            <span>적군 손실</span>
            <b>{fmt(rep.enemyLoss)}</b>
          </div>
          <div>
            <span>포로</span>
            <b style={{ fontSize: 'var(--fs-small)' }}>{rep.captured.length ? rep.captured.join('·') : '없음'}</b>
          </div>
          <div>
            <span>수훈</span>
            <b style={{ fontSize: 'var(--fs-small)' }}>{rep.mvp ?? '-'}</b>
          </div>
        </div>
        {rep.duels.length > 0 && (
          <div className="duel-cards">
            {rep.duels.map((d) => (
              <button key={d.index} className="duel-card" onClick={() => setReplay(d.index)}>
                <b className="disp">一騎</b>
                <span>
                  {d.a} 대 {d.b}
                  {d.day ? <span className="dim small"> · {d.day}일째</span> : null}
                  <br />
                  <span className={d.mineWon === null ? 'dim' : d.mineWon ? 'good' : 'bad'}>{d.outcome}</span>
                </span>
                <span className="dim small" style={{ marginLeft: 'auto' }}>
                  다시 보기 ▶
                </span>
              </button>
            ))}
          </div>
        )}
        {rep.enemyPolicy && (
          <div className="policy-reveal">
            <span>
              적의 방침 <b>{rep.enemyPolicy}</b> · 우리 방침 <b>{rep.myPolicy}</b>
            </span>
            <span className={tone}>
              상성 {rep.matchup} · {rep.matchupText}
            </span>
            {rep.myExec && (
              <span className="dim">
                우리 실행도 {rep.myExec.value}/{rep.myExec.req} ({rep.myExec.note})
                {rep.enemyExec ? ` · 적 ${rep.enemyExec.value}/${rep.enemyExec.req} (${rep.enemyExec.note})` : ''}
              </span>
            )}
          </div>
        )}
        {(rep.lostCaptured.length > 0 || rep.lostKilled.length > 0 || rep.killed.length > 0) && (
          <div className="small">
            {rep.killed.length > 0 && <span className="good">적 전사: {rep.killed.join(', ')} </span>}
            {rep.lostKilled.length > 0 && <span className="bad">아군 전사: {rep.lostKilled.join(', ')} </span>}
            {rep.lostCaptured.length > 0 && <span className="bad">아군 포로: {rep.lostCaptured.join(', ')}</span>}
          </div>
        )}
        <div style={{ borderLeft: '2px solid var(--g-gold)', padding: '4px 12px', fontFamily: 'var(--font-display)', fontSize: 15 }}>{sentence}</div>
        <div className="small" style={{ lineHeight: 1.5 }}>
          <span className="dim">군사 총평 · </span>
          {rep.advice}
        </div>
        <div style={{ display: 'grid', gap: 2 }}>
          {rep.units.map((u) => (
            <div key={u.officer} style={{ display: 'flex', gap: 8, alignItems: 'center' }} className="small">
              <Seal id={u.officer} name={u.name} faction={u.faction} />
              <span style={{ minWidth: 60 }}>{u.name}</span>
              <span className="num dim">
                {fmt(u.troops)} / {fmt(u.startTroops)} · 입힌 피해 {fmt(u.dealt)}
              </span>
              <span className={u.status === 'active' ? 'good' : 'warn'}>{STATUS_NAME[u.status]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="abs" style={{ right: 'var(--sa)', bottom: 14 }}>
        <Btn kind="primary" style={{ width: 120 }} onClick={onDone}>
          계속
        </Btn>
      </div>
    </div>
  );
}
