/**
 * 작전 자동 전투의 일기토 판정 (전투개편 v2 설계서 9-2)
 * - 장수별 일기토 방침: 적극 신청(seek) / 받으면 수락(accept) / 거절(refuse)
 * - 선봉 대치: 양군 장수가 맞붙을 만큼 가까워지면 판정 (한쪽 무력 80+)
 * - 연의 매치업: 지정 조합이 같은 전장에 있으면 확률이 크게 오르고 전용 대사를 쓴다
 * 일어난 일기토는 runDuel이 연출 큐에 넣어 관전 화면이 장면으로 재생한다.
 */
import draft from '../../../전투시나리오/battle-scenarios.draft.json';
import { josa } from '../josa';
import { activeUnits, dist, rngOf, runDuel } from './battle';
import { defaultDuelPolicy } from './plan';
import type { BattleState, BUnit, DuelPolicy } from './types';
export { defaultDuelPolicy };

export interface DuelMatchup {
  a: string;
  b: string;
  mode: 'both' | 'yanyi' | 'zhengshi';
  source?: string;
  lineA?: string;
  lineB?: string;
}

/** 설계서 9-2의 연의 매치업 중 초안 JSON에 없는 것 (대사는 일반형) */
const EXTRA: DuelMatchup[] = [
  { a: 'guan_yu', b: 'hua_xiong', mode: 'yanyi', source: '연의 5회: 술이 식기 전에 화웅을 베다', lineA: '술은 잠시 두어라. 곧 돌아오겠다.', lineB: '이름 없는 마궁수가 감히 나서느냐!' },
  { a: 'zhang_fei', b: 'lu_bu', mode: 'yanyi', source: '연의 5회: 호뢰관 삼영전', lineA: '세 성씨를 섬기는 종놈아, 연인 장익덕이 여기 있다!', lineB: '고리눈의 촌놈이로구나.' },
  { a: 'guan_yu', b: 'lu_bu', mode: 'yanyi', source: '연의 5회: 호뢰관 삼영전', lineA: '아우를 돕겠다. 여포, 내 청룡도를 받아라!', lineB: '둘이 덤벼도 마찬가지다!' },
  { a: 'liu_bei', b: 'lu_bu', mode: 'yanyi', source: '연의 5회: 호뢰관 삼영전', lineA: '형제가 함께 싸운다!', lineB: '셋이라도 두렵지 않다!' },
  { a: 'zhang_fei', b: 'ma_chao', mode: 'yanyi', source: '연의 65회: 가맹관에서 횃불을 밝히고 밤까지 싸우다', lineA: '연인 장익덕을 아느냐!', lineB: '대대로 공후의 가문이다. 촌부 따위를 알 리가 있나.' },
  { a: 'guan_yu', b: 'huang_zhong', mode: 'yanyi', source: '연의 53회: 장사에서 관우와 황충이 백여 합을 겨루다', lineA: '노장, 목숨을 아끼시오.', lineB: '늙었다고 얕보지 마라!' },
  { a: 'dian_wei', b: 'xu_chu', mode: 'yanyi', source: '연의 12회: 전위와 허저가 맞붙어 승부를 내지 못하다', lineA: '네가 그 범 같은 장사냐.', lineB: '한번 겨뤄 보자!' },
];

const fromDraft = ((draft as { duelMatchups?: DuelMatchup[] }).duelMatchups ?? []).map((m) => ({ ...m }));
/** 연의 모드에서 쓰는 매치업 (정사 전용은 제외) */
export const DUEL_MATCHUPS: DuelMatchup[] = [...fromDraft, ...EXTRA].filter((m) => m.mode !== 'zhengshi');

export function matchupOf(a: string, b: string): { m: DuelMatchup; flip: boolean } | null {
  for (const m of DUEL_MATCHUPS) {
    if (m.a === a && m.b === b) return { m, flip: false };
    if (m.a === b && m.b === a) return { m, flip: true };
  }
  return null;
}


export function duelPolicyOf(b: BattleState, u: BUnit): DuelPolicy {
  return b.plans?.[u.side]?.units[u.id]?.duel ?? defaultDuelPolicy(u.war);
}

/** 한 전투에서 일어나는 일기토 최대 수 (사용자 요청: 한 전투에 한 번 정도) */
export const MAX_DUELS = 1;
/** 첫 충돌 뒤 이 틱 수(이틀)가 지나야 일기토가 난다: 먼저 병사들의 싸움을 보여 준다 (사용자 요청: 붙자마자 끝나지 않게) */
export const DUEL_AFTER_CLASH = 24;
/** 선봉 대치 판정 거리 */
const DUEL_RANGE = 2;
/** 조건이 맞을 때 한 틱에 일기토 신청이 나올 확률 (%) — probe-duel.mts 로 보정 */
export const DUEL_CHANCE = 4;

/** 받는 쪽이 수락하는지: 거절 방침이면 거절, 무력이 비슷하면 수락, 크게 밀리면 30% 객기. 매치업이면 늘 수락 */
export function duelAcceptsAuto(b: BattleState, ch: BUnit, t: BUnit, matched: boolean, roll: () => number): boolean {
  const pol = duelPolicyOf(b, t);
  if (pol === 'refuse') return false;
  if (matched || t.war + 10 >= ch.war) return true;
  return roll() < 0.3;
}

/**
 * 매 틱 부른다. 조건이 맞으면 일기토를 실행하고 true.
 * 신청자: 일기토 방침이 '적극'인 무력 80+ 장수. 상대: 2칸 안에 보이는 적 장수 (매치업 상대를 먼저 고른다)
 */
export function duelCheck(b: BattleState): boolean {
  if (b.result || !b.started || b.duels.length >= MAX_DUELS) return false;
  if (b.firstClash === undefined || b.tick - b.firstClash < DUEL_AFTER_CLASH) return false;
  // 같은 틱 연속 판정을 막는다: 직전 일기토 뒤 하루는 쉰다
  const last = b.duels[b.duels.length - 1];
  if (last?.tick !== undefined && b.tick - last.tick < 12) return false;
  const rng = rngOf(b);
  const pairs: { c: BUnit; t: BUnit; matched: boolean; flip: boolean; m?: DuelMatchup }[] = [];
  for (const c of activeUnits(b)) {
    if (c.hidden || c.dueled || c.confused || c.order.type === 'retreat' || c.war < 80 || duelPolicyOf(b, c) !== 'seek') continue;
    for (const t of activeUnits(b, c.side === 'atk' ? 'def' : 'atk')) {
      if (t.hidden || t.dueled || dist(c.x, c.y, t.x, t.y) > DUEL_RANGE) continue;
      const mu = matchupOf(c.officer, t.officer);
      pairs.push({ c, t, matched: !!mu, flip: mu?.flip ?? false, m: mu?.m });
    }
  }
  if (!pairs.length) return false;
  // 매치업 → 무력 높은 상대 순으로
  pairs.sort((p, q) => Number(q.matched) - Number(p.matched) || q.t.war - p.t.war);
  const p = pairs[0]!;
  if (!rng.chance(p.matched ? DUEL_CHANCE * 5 : DUEL_CHANCE)) return false;
  if (!duelAcceptsAuto(b, p.c, p.t, p.matched, () => rng.next())) {
    p.c.dueled = true; // 거절당한 장수는 이번 전투에서 다시 신청하지 않는다
    b.log.push(`${p.c.name}의 일기토 신청을 ${josa(p.t.name, '이/가')} 피했다`);
    return false;
  }
  const lineA = p.m ? (p.flip ? p.m.lineB : p.m.lineA) : undefined;
  const lineB = p.m ? (p.flip ? p.m.lineA : p.m.lineB) : undefined;
  runDuel(b, p.c, p.t, { lineA, lineB, source: p.m?.source });
  return true;
}

/**
 * 재생할 합 고르기 (설계서 9-3 ③): 40합 중 결정적인 합만 5~12개.
 * 첫 합, 큰 일격·반격이 나온 합, 마지막 합(결정타)을 고른다.
 */
export function duelHighlights(rounds: { aHp: number; bHp: number; text: string }[]): number[] {
  if (!rounds.length) return [];
  const n = rounds.length;
  const pick = new Set<number>([0, n - 1]);
  const swing = rounds
    .map((r, i) => {
      const p = i ? rounds[i - 1]! : { aHp: 100, bHp: 100 };
      return { i, d: p.aHp - r.aHp + (p.bHp - r.bHp) + (r.text.includes('일격') || r.text.includes('반격') ? 8 : 0) };
    })
    .sort((x, y) => y.d - x.d);
  const want = Math.max(5, Math.min(12, Math.round(n / 3)));
  for (const s of swing) {
    if (pick.size >= Math.min(want, n)) break;
    pick.add(s.i);
  }
  return [...pick].sort((x, y) => x - y);
}
