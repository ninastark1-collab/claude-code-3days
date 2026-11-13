/**
 * 방침 매트릭스 시험 (설계서 15-2): 공격 6 × 방어 6을 같은 전력으로 반복해 승률표를 뽑는다.
 * 지형은 실제 전장 생성기를 시드마다 다르게 쓰고, 부대는 능력·병종·훈련이 같은 가상 부대로 바꾼다.
 */
import type { Game } from '../ctx';
import type { BattleSetup } from '../state';
import { preparePlannedBattle, runPlannedBattle, setPlan } from './auto';
import { createBattle } from './battle';
import { ATK_POLICIES, DEF_POLICIES, defaultPlan } from './plan';
import type { AtkPolicy, BattleState, BUnit, DefPolicy, Side, UnitKind } from './types';

const KINDS: UnitKind[] = ['infantry', 'infantry', 'cavalry', 'archer', 'infantry'];
const SPOTS: Record<Side, [number, number][]> = {
  atk: [[2, 8], [2, 6], [2, 10], [1, 7], [1, 9]],
  def: [[19, 8], [18, 8], [20, 8], [19, 7], [19, 9]],
};

export interface MatrixOpts {
  /** 공격군 병력 배율 (공성 쪽 기본 이점을 맞추는 값) */
  atkMult?: number;
  /** 능력치 (통솔·무력·지력 모두) */
  stat?: number;
  training?: number;
  troops?: number;
  /** 공격군 군량 (일) */
  foodDays?: number;
}

/** 같은 전력의 가상 전투 하나를 만든다 */
export function equalBattle(g: Game, setup: BattleSetup, o: MatrixOpts = {}): BattleState {
  const b = createBattle(g, setup, null);
  const stat = o.stat ?? 72;
  const tr = o.training ?? 60;
  const troops = o.troops ?? 6000;
  const mk = (side: Side, i: number): BUnit => {
    const [x, y] = SPOTS[side][i]!;
    const t = Math.round(troops * (side === 'atk' ? (o.atkMult ?? 1) : 1));
    return {
      id: `${side}_eq${i}`, officer: `eq${side}${i}`, name: `${side === 'atk' ? '공' : '수'}${i + 1}`, side, faction: null,
      kind: KINDS[i]!, troops: t, startTroops: t, training: tr, morale: 70 + Math.round(tr / 5), x, y, mp: 0, atkCd: 0, tacCd: 12,
      confused: 0, order: { type: 'hold' }, status: 'active', lea: stat, war: stat, int: stat, cha: stat, skills: [],
    };
  };
  b.units = [0, 1, 2, 3, 4].map((i) => mk('atk', i)).concat([0, 1, 2, 3, 4].map((i) => mk('def', i)));
  b.leaders = { atk: 'eqatk0', def: 'eqdef0' };
  b.defFood = 1e6;
  // 공격군 군량: AI 출진과 같은 25일분
  b.atkFood = Math.ceil(b.units.filter((u) => u.side === 'atk').reduce((s, u) => s + u.troops, 0) / 100) * (o.foodDays ?? 25);
  b.weather = 'clear';
  return b;
}

export function playPair(g: Game, setup: BattleSetup, a: AtkPolicy, d: DefPolicy, o: MatrixOpts = {}): BattleState {
  const b = equalBattle(g, setup, o);
  preparePlannedBattle(b, []);
  setPlan(b, 'atk', defaultPlan(b, 'atk', a));
  setPlan(b, 'def', defaultPlan(b, 'def', d));
  runPlannedBattle(b);
  return b;
}

export interface MatrixResult {
  /** [공격 방침][방어 방침] = 공격 승률 (0~1) */
  table: Record<AtkPolicy, Record<DefPolicy, number>>;
  /** 방침별 평균 승률 (자기 쪽 기준) */
  avg: Record<string, number>;
  atkOverall: number;
  avgTicks: number;
}

export function runMatrix(makeGame: (seed: number) => { g: Game; setup: BattleSetup }, n: number, o: MatrixOpts = {}): MatrixResult {
  const table = {} as MatrixResult['table'];
  let ticks = 0;
  let total = 0;
  let atkWins = 0;
  for (const a of ATK_POLICIES) {
    table[a] = {} as Record<DefPolicy, number>;
    for (const d of DEF_POLICIES) {
      let w = 0;
      for (let i = 0; i < n; i++) {
        const { g, setup } = makeGame(i * 7919 + 13);
        const b = playPair(g, setup, a, d, o);
        if (b.result?.winner === 'atk') w++;
        ticks += b.tick;
        total++;
      }
      table[a][d] = w / n;
      atkWins += w;
    }
  }
  const avg: Record<string, number> = {};
  for (const a of ATK_POLICIES) avg[a] = DEF_POLICIES.reduce((s, d) => s + table[a][d], 0) / DEF_POLICIES.length;
  for (const d of DEF_POLICIES) avg[d] = 1 - ATK_POLICIES.reduce((s, a) => s + table[a][d], 0) / ATK_POLICIES.length;
  return { table, avg, atkOverall: atkWins / total, avgTicks: ticks / total };
}
