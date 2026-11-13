/**
 * 동맹 협공: 동맹국에 사자를 보내 같은 적 도시를 함께 치기로 약속한다.
 * - 약속 기간(2개월) 안에 내가 그 도시를 치면, 동맹국이 인접 도시에서 원군(최대 2부대)을 보내 함께 싸운다.
 * - 동맹국 AI도 그 기간에는 그 도시를 우선 공격 목표로 삼는다.
 */
import { base, cname, fname, oname, type Game } from './ctx';
import { getRelation, type BattleSetup, type JointPact } from './state';
import { canAttack, citiesOf, clamp, factionTotals, neighborsOf, officersIn } from './world';
import type { Result } from './commands';
import { josa } from './josa';

export const JOINT_COST = 200;
export const JOINT_MONTHS = 2;
const monthIndex = (g: Game) => g.s.year * 12 + g.s.month;

/** 지금 유효한 협공 약속 (기간이 지난 것은 지운다) */
export function activePacts(g: Game): JointPact[] {
  const now = monthIndex(g);
  if (g.s.pacts) g.s.pacts = g.s.pacts.filter((p) => p.until >= now && g.s.factions[p.ally]?.alive && g.s.factions[p.by]?.alive);
  return g.s.pacts ?? [];
}

export function pactFor(g: Game, by: string, city: string): JointPact | undefined {
  return activePacts(g).find((p) => p.by === by && p.city === city);
}

/** 나와 동맹국이 함께 칠 수 있는 도시: 양쪽 모두와 맞닿은 제3세력 도시 */
export function jointTargets(g: Game, me: string, ally: string): string[] {
  const touch = (f: string) => {
    const set = new Set<string>();
    for (const c of citiesOf(g, f)) for (const n of neighborsOf(g, c.id)) set.add(n.to);
    return set;
  };
  const a = touch(me);
  const b = touch(ally);
  return [...a].filter((id) => {
    const owner = g.s.cities[id]?.faction;
    return b.has(id) && !!owner && owner !== me && owner !== ally && canAttack(g, me, owner) && canAttack(g, ally, owner);
  });
}

/** 협공 수락 확률 (%) */
export function jointChance(g: Game, envoyId: string, me: string, ally: string, city: string): number {
  const r = getRelation(g.s, me, ally);
  if (r.treaty !== 'alliance') return 0;
  const owner = g.s.cities[city]?.faction;
  if (!owner) return 0;
  const eb = base(g, envoyId);
  const allyPow = factionTotals(g, ally).power;
  const enemyPow = factionTotals(g, owner).power;
  // 동맹국도 적을 두려워하면 망설인다. 적과 사이가 나쁠수록 기꺼이 나선다
  const hate = 50 - getRelation(g.s, ally, owner).friendship;
  const p = (r.friendship - 40) + (eb.charisma - 60) / 3 + (eb.skills.includes('diplomacy') ? 10 : 0) + hate / 3 + (allyPow > enemyPow ? 10 : -15);
  return Math.round(clamp(p, 5, 90));
}

export function diploJointAttack(g: Game, envoyId: string, ally: string, city: string): Result {
  const o = g.s.officers[envoyId];
  if (!o || o.status !== 'serving' || !o.faction) return { ok: false, msg: '명령할 수 없는 무장입니다.' };
  if (o.acted) return { ok: false, msg: `${josa(oname(g, envoyId), '은/는')} 이번 달 이미 명령을 수행했습니다.` };
  const me = o.faction;
  if (getRelation(g.s, me, ally).treaty !== 'alliance') return { ok: false, msg: '동맹국에만 협공을 청할 수 있습니다.' };
  if (!jointTargets(g, me, ally).includes(city)) return { ok: false, msg: '양쪽 모두와 맞닿은 적 도시여야 합니다.' };
  if (pactFor(g, me, city)) return { ok: false, msg: '이미 그 도시를 함께 치기로 약속했습니다.' };
  const from = g.s.cities[o.city]!;
  if (from.gold < JOINT_COST) return { ok: false, msg: `금이 부족합니다 (군자금 ${JOINT_COST}).` };
  from.gold -= JOINT_COST;
  o.acted = true;
  const p = jointChance(g, envoyId, me, ally, city);
  const r = getRelation(g.s, me, ally);
  if (!g.rng.chance(p)) {
    r.friendship = clamp(r.friendship - 3, 0, 100);
    return { ok: true, msg: `${josa(fname(g, ally), '이/가')} 협공 요청을 거절했습니다. (확률 ${p}%)` };
  }
  (g.s.pacts ??= []).push({ by: me, ally, city, until: monthIndex(g) + JOINT_MONTHS - 1 });
  return { ok: true, msg: `${josa(fname(g, ally), '이/가')} ${cname(g, city)} 협공을 약속했습니다! ${JOINT_MONTHS}개월 안에 출진하면 원군이 합류합니다.` };
}

/** 동맹 원군 후보: 목표와 맞닿은 동맹국 도시에서 병력 1000 이상, 도시마다 1부대는 남긴다. 군주는 오지 않는다 */
export function allyReinforcements(g: Game, by: string, city: string): NonNullable<BattleSetup['allies']> {
  const pact = pactFor(g, by, city);
  if (!pact) return [];
  const ally = pact.ally;
  const ruler = g.s.factions[ally]!.ruler;
  const out: NonNullable<BattleSetup['allies']> = [];
  for (const n of neighborsOf(g, city)) {
    if (g.s.cities[n.to]?.faction !== ally) continue;
    const here = officersIn(g, n.to, ally).filter((x) => x.troops > 0);
    const cand = here
      .filter((x) => x.id !== ruler && x.troops >= 1000)
      .sort((a, b) => b.troops * (base(g, b.id).leadership + base(g, b.id).war) - a.troops * (base(g, a.id).leadership + base(g, a.id).war));
    const canSend = Math.max(0, here.length - 1);
    for (const x of cand.slice(0, canSend)) {
      if (out.length >= 2) break;
      out.push({ officer: x.id, troops: x.troops, faction: ally, from: n.to });
    }
  }
  return out;
}

/** 출진에 동맹 원군을 붙이고 약속을 쓴다 */
export function attachAllies(g: Game, setup: BattleSetup): void {
  const allies = allyReinforcements(g, setup.attacker, setup.city);
  if (!allies.length) return;
  setup.allies = allies;
  for (const a of allies) g.s.officers[a.officer]!.acted = true;
  g.s.pacts = (g.s.pacts ?? []).filter((p) => !(p.by === setup.attacker && p.city === setup.city));
}

/** AI 동맹국: 협공을 약속한 도시는 덜 신중하게, 먼저 친다 */
export function pactBoost(g: Game, faction: string, city: string): boolean {
  return activePacts(g).some((p) => p.ally === faction && p.city === city);
}
