import { base, cityBase, cname, fname, oname, type Game } from './ctx';
import { onRelease } from './events';
import { addLog, assignGovernor, getRelation, type BattleSetup, type OfficerState } from './state';
import {
  armyPower,
  canAttack,
  citiesOf,
  clamp,
  valuesDistance,
  factionTotals,
  freeOfficersIn,
  isAdjacent,
  isRuler,
  maxTroops,
  officersIn,
  officersOf,
  ownPathExists,
} from './world';

export interface Result {
  ok: boolean;
  msg: string;
}
const ok = (msg: string): Result => ({ ok: true, msg });
const fail = (msg: string): Result => ({ ok: false, msg });

/** 명령을 수행할 수 있는 무장인지 확인 */
function actor(g: Game, officerId: string): OfficerState | string {
  const o = g.s.officers[officerId];
  if (!o || o.status !== 'serving' || !o.faction) return '명령할 수 없는 무장입니다.';
  if (o.acted) return `${oname(g, officerId)}은(는) 이번 달 이미 명령을 수행했습니다.`;
  if (g.s.cities[o.city]?.faction !== o.faction) return '자기 세력 도시에 있지 않습니다.';
  return o;
}

function spend(g: Game, cityId: string, gold: number): boolean {
  const c = g.s.cities[cityId]!;
  if (c.gold < gold) return false;
  c.gold -= gold;
  return true;
}

// ───────────────────────────── 내정 ─────────────────────────────

export type DevelopKind = 'agriculture' | 'commerce' | 'walls' | 'order';
export const DEVELOP_COST: Record<DevelopKind, number> = { agriculture: 50, commerce: 50, walls: 60, order: 30 };
const DEVELOP_LABEL: Record<DevelopKind, string> = { agriculture: '농업', commerce: '상업', walls: '성벽', order: '치안' };

export function develop(g: Game, officerId: string, kind: DevelopKind): Result {
  const o = actor(g, officerId);
  if (typeof o === 'string') return fail(o);
  const c = g.s.cities[o.city]!;
  const cb = cityBase(g, o.city);
  const max = kind === 'agriculture' ? cb.maxAgriculture : kind === 'commerce' ? cb.maxCommerce : kind === 'walls' ? cb.maxWalls : 100;
  if (c[kind] >= max) return fail(`${DEVELOP_LABEL[kind]}이(가) 이미 최대입니다.`);
  if (!spend(g, o.city, DEVELOP_COST[kind])) return fail('금이 부족합니다.');
  const b = base(g, officerId);
  let gain: number;
  if (kind === 'agriculture' || kind === 'commerce') {
    gain = b.politics / 6 + g.rng.int(0, 6);
    if (b.skills.includes(kind)) gain *= 1.3;
  } else if (kind === 'walls') {
    gain = (b.leadership + b.politics) / 12 + g.rng.int(0, 6);
    if (b.skills.includes('siege')) gain *= 1.3;
  } else {
    gain = (b.war + b.leadership) / 25 + g.rng.int(1, 4);
  }
  gain = Math.max(1, Math.round(gain));
  c[kind] = Math.min(max, c[kind] + gain);
  if (kind === 'order') c.support = clamp(c.support + 1, 0, 100);
  o.acted = true;
  return ok(`${oname(g, officerId)}: ${cname(g, o.city)}의 ${DEVELOP_LABEL[kind]} +${gain}`);
}

/** 민심 회복 (군량 배급) */
export function relief(g: Game, officerId: string): Result {
  const o = actor(g, officerId);
  if (typeof o === 'string') return fail(o);
  const c = g.s.cities[o.city]!;
  const food = Math.max(500, Math.round(c.population / 200));
  if (c.food < food) return fail('군량이 부족합니다.');
  if (c.support >= 100) return fail('민심이 이미 최대입니다.');
  c.food -= food;
  const gain = Math.round(base(g, officerId).charisma / 12 + g.rng.int(1, 4));
  c.support = clamp(c.support + gain, 0, 100);
  o.acted = true;
  return ok(`${oname(g, officerId)}: 군량 ${food}을 풀어 민심 +${gain}`);
}

export function conscript(g: Game, officerId: string): Result {
  const o = actor(g, officerId);
  if (typeof o === 'string') return fail(o);
  const c = g.s.cities[o.city]!;
  const b = base(g, officerId);
  const room = maxTroops(g, officerId) - o.troops;
  if (room <= 0) return fail(`${b.name}의 병력이 이미 최대입니다 (${maxTroops(g, officerId)}).`);
  let amount = Math.round((b.charisma * 40 + c.support * 20 + g.rng.int(0, 1000)) / 100) * 100;
  amount = Math.min(amount, room, Math.floor(c.population * 0.03));
  if (amount < 100) return fail('징병할 인구가 부족합니다.');
  const cost = Math.round(amount / 10);
  if (!spend(g, o.city, cost)) return fail(`금이 부족합니다 (필요 ${cost}).`);
  const before = o.troops;
  const trBefore = o.training;
  o.training = Math.round((o.training * o.troops + 20 * amount) / (o.troops + amount));
  o.troops += amount;
  c.population -= amount;
  c.support = clamp(c.support - Math.ceil(amount / 1500), 0, 100);
  o.acted = true;
  const tr = o.training !== trBefore ? ` · 훈련 ${trBefore}→${o.training}` : '';
  return ok(`${b.name}: 병사 ${amount}명 징병 · 병력 ${before}→${o.troops}${tr} · 금 -${cost} (남은 금 ${c.gold})`);
}

export function train(g: Game, officerId: string): Result {
  const o = actor(g, officerId);
  if (typeof o === 'string') return fail(o);
  if (o.troops <= 0) return fail('훈련할 병사가 없습니다.');
  if (o.training >= 100) return fail('훈련도가 이미 최대입니다.');
  const gain = Math.round(base(g, officerId).leadership / 9 + g.rng.int(1, 4));
  const before = o.training;
  o.training = Math.min(100, o.training + gain);
  o.acted = true;
  return ok(`${oname(g, officerId)}: 훈련도 ${before}→${o.training} (+${o.training - before}) · 병력 ${o.troops}`);
}

/** 탐색: 재야 무장 발견 또는 자금 발견 */
export function search(g: Game, officerId: string): Result {
  const o = actor(g, officerId);
  if (typeof o === 'string') return fail(o);
  o.acted = true;
  const b = base(g, officerId);
  const hidden = freeOfficersIn(g, o.city).filter((f) => !f.found);
  if (hidden.length && g.rng.chance(35 + b.intelligence / 3 + (b.skills.includes('recruit') ? 15 : 0))) {
    const t = g.rng.pick(hidden);
    t.found = true;
    return ok(`${b.name}: 재야의 인재 ${oname(g, t.id)}을(를) 발견했습니다!`);
  }
  if (g.rng.chance(40)) {
    const gold = g.rng.int(5, 20) * 10;
    g.s.cities[o.city]!.gold += gold;
    return ok(`${b.name}: 금 ${gold}을 발견했습니다.`);
  }
  return ok(`${b.name}: 아무것도 찾지 못했습니다.`);
}

// ───────────────────────────── 인사 ─────────────────────────────

/** 등용 성공 확률 (%) */
export function recruitChance(g: Game, recruiterId: string, targetId: string): number {
  const r = base(g, recruiterId);
  const t = base(g, targetId);
  const ts = g.s.officers[targetId]!;
  const rf = g.s.officers[recruiterId]!.faction!;
  const ruler = base(g, g.s.factions[rf]!.ruler);
  const compat = valuesDistance(ruler.values, t.values);
  let p: number;
  if (ts.status === 'free') {
    p = 45 + (r.charisma - 50) * 0.5 - compat * 0.7 + (r.skills.includes('recruit') ? 15 : 0);
    if (t.sworn && ruler.sworn === t.sworn) p += 60;
  } else if (ts.status === 'captive') {
    // 포로: 옛 주인을 섬기려는 마음이 강하다. 의리 높은 장수는 거의 넘어오지 않는다
    p = 20 + (r.charisma - 50) * 0.3 - compat * 0.6 - t.loyaltyTrait * 2.5 + (100 - ts.loyalty) * 0.3;
    if (ts.faction && !g.s.factions[ts.faction]?.alive) p += 25;
    p = Math.min(p, 80);
  } else {
    if (isRuler(g, targetId)) return 0;
    const theirRuler = base(g, g.s.factions[ts.faction!]!.ruler);
    if (t.sworn && t.sworn === theirRuler.sworn) return 0;
    if (t.father && t.father === theirRuler.id) return 0;
    // 다른 세력의 현역 장수: 충성이 꽤 떨어지지 않으면 넘어오지 않는다 (충성 80 이상은 불가)
    if (ts.loyalty >= 80) return 0;
    p = (100 - ts.loyalty) * 0.7 + (r.charisma - 50) * 0.25 - (theirRuler.charisma - 50) * 0.2 - compat * 0.5 - t.loyaltyTrait * 2.5 - 20;
    p = Math.min(p, 60);
  }
  if (g.s.factions[rf]?.emperor) p += 5;
  return Math.round(clamp(p, 0, 95));
}

/** 다른 세력 장수에게 등용을 거절당한 뒤 다시 권유할 수 있을 때까지 남은 개월 (0이면 가능) */
export function recruitCooldown(g: Game, targetId: string): number {
  const last = g.s.flags[`rc_${targetId}`];
  if (typeof last !== 'number') return 0;
  return Math.max(0, last + 3 - (g.s.year * 12 + g.s.month));
}

export function recruit(g: Game, officerId: string, targetId: string): Result {
  const o = actor(g, officerId);
  if (typeof o === 'string') return fail(o);
  const t = g.s.officers[targetId];
  if (!t) return fail('대상이 없습니다.');
  if (t.status === 'free') {
    if (t.city !== o.city) return fail('같은 도시의 재야 무장만 등용할 수 있습니다.');
    if (!t.found && o.faction === g.s.playerFaction) return fail('먼저 탐색으로 발견해야 합니다.');
  } else if (t.status === 'serving') {
    if (t.faction === o.faction) return fail('이미 아군입니다.');
    const cd = recruitCooldown(g, targetId);
    if (cd > 0) return fail(`${oname(g, targetId)}은(는) 최근 등용 권유를 거절해 경계 중입니다 (${cd}개월 후 가능).`);
  } else return fail('등용할 수 없는 상태입니다.');
  const cost = t.status === 'serving' ? 100 : 0;
  if (cost && !spend(g, o.city, cost)) return fail('금이 부족합니다 (100).');
  o.acted = true;
  const p = recruitChance(g, officerId, targetId);
  if (!g.rng.chance(p)) {
    if (t.status === 'serving') {
      // 거절당하면 3개월 동안 다시 권유할 수 없고, 상대 세력도 눈치챈다
      g.s.flags[`rc_${targetId}`] = g.s.year * 12 + g.s.month;
      if (t.faction && g.s.factions[t.faction]?.alive) {
        const rel = getRelation(g.s, o.faction!, t.faction);
        rel.friendship = clamp(rel.friendship - 2, 0, 100);
      }
    }
    return ok(`${oname(g, targetId)}이(가) 등용을 거절했습니다. (확률 ${p}%)`);
  }
  joinFaction(g, targetId, o.faction!, o.city);
  return ok(`${oname(g, targetId)}이(가) ${fname(g, o.faction)}에 합류했습니다!`);
}

/** 무장을 세력에 합류시킨다 (기존 소속에서 빠짐) */
export function joinFaction(g: Game, officerId: string, faction: string, city: string): void {
  const t = g.s.officers[officerId]!;
  const prevCity = t.city;
  const prevFaction = t.status === 'serving' ? t.faction : null;
  if (prevFaction) addLog(g.s, `${oname(g, officerId)}: ${fname(g, prevFaction)} → ${fname(g, faction)}`);
  else addLog(g.s, `${oname(g, officerId)}이(가) ${fname(g, faction)}에 합류`);
  // 다른 세력에서 넘어오면 병력은 원래 도시에 남기지 않고 데려오지 않는다 (흩어짐)
  if (prevFaction) t.troops = 0;
  t.status = 'serving';
  t.faction = faction;
  t.city = city;
  t.captor = undefined;
  t.found = undefined;
  const b = base(g, officerId);
  t.loyalty = clamp(55 + b.loyaltyTrait * 2 + g.rng.int(0, 10), 0, 100);
  t.acted = true;
  if (prevCity) assignGovernor(g.s, prevCity);
  assignGovernor(g.s, city);
}

export function reward(g: Game, faction: string, targetId: string, gold = 100): Result {
  const t = g.s.officers[targetId];
  if (!t || t.status !== 'serving' || t.faction !== faction) return fail('아군 무장이 아닙니다.');
  if (isRuler(g, targetId)) return fail('군주에게는 포상할 수 없습니다.');
  if (t.loyalty >= 100) return fail('충성도가 이미 최대입니다.');
  if (!spend(g, t.city, gold)) return fail('금이 부족합니다.');
  // 38장 안전핀: 같은 해에 같은 장수에게 거듭 포상하면 효과가 줄어든다 (1/2, 1/3 …)
  const key = `rw_${targetId}_${g.s.year}`;
  const times = Number(g.s.flags[key] ?? 0);
  g.s.flags[key] = times + 1;
  const raw = gold / 20 + g.rng.int(0, 4) - base(g, targetId).ambition / 5;
  const gain = Math.max(1, Math.round(raw / (1 + times)));
  t.loyalty = clamp(t.loyalty + gain, 0, 100);
  return ok(`${oname(g, targetId)}에게 금 ${gold} 포상: 충성 +${gain} (${t.loyalty})${times ? ` · 올해 ${times + 1}번째라 효과 감소` : ''}`);
}

export function moveOfficer(g: Game, officerId: string, to: string): Result {
  const o = actor(g, officerId);
  if (typeof o === 'string') return fail(o);
  if (o.city === to) return fail('이미 그 도시에 있습니다.');
  if (g.s.cities[to]?.faction !== o.faction) return fail('아군 도시로만 이동할 수 있습니다.');
  if (!ownPathExists(g, o.faction!, o.city, to)) return fail('아군 영토로 이어진 길이 없습니다.');
  const from = o.city;
  o.city = to;
  o.acted = true;
  assignGovernor(g.s, from);
  assignGovernor(g.s, to);
  return ok(`${oname(g, officerId)}: ${cname(g, from)} → ${cname(g, to)} 이동`);
}

export function transport(g: Game, officerId: string, to: string, gold: number, food: number): Result {
  const o = actor(g, officerId);
  if (typeof o === 'string') return fail(o);
  const from = g.s.cities[o.city]!;
  const dest = g.s.cities[to];
  if (!dest || dest.faction !== o.faction || to === o.city) return fail('다른 아군 도시를 선택하세요.');
  if (!ownPathExists(g, o.faction!, o.city, to)) return fail('아군 영토로 이어진 길이 없습니다.');
  gold = Math.max(0, Math.floor(gold));
  food = Math.max(0, Math.floor(food));
  if (gold > from.gold || food > from.food) return fail('보낼 물자가 부족합니다.');
  if (gold + food === 0) return fail('보낼 양을 지정하세요.');
  from.gold -= gold;
  from.food -= food;
  dest.gold += gold;
  dest.food += food;
  o.acted = true;
  return ok(`${oname(g, officerId)}: ${cname(g, to)}로 금 ${gold}, 군량 ${food} 수송`);
}

export function appointGovernor(g: Game, cityId: string, officerId: string): Result {
  const c = g.s.cities[cityId];
  const o = g.s.officers[officerId];
  if (!c || !o || o.status !== 'serving' || o.city !== cityId || o.faction !== c.faction) return fail('그 도시의 아군 무장이 아닙니다.');
  const ruler = g.s.factions[c.faction!]!.ruler;
  if (g.s.officers[ruler]?.city === cityId && officerId !== ruler) return fail('군주가 있는 도시는 군주가 태수입니다.');
  c.governor = officerId;
  return ok(`${oname(g, officerId)}을(를) ${cname(g, cityId)} 태수로 임명`);
}

/** 같은 도시 무장끼리 병력 이동 */
export function transferTroops(g: Game, fromId: string, toId: string, amount: number): Result {
  const a = g.s.officers[fromId];
  const b = g.s.officers[toId];
  if (!a || !b || a.status !== 'serving' || b.status !== 'serving' || a.faction !== b.faction || a.city !== b.city)
    return fail('같은 도시의 아군 무장끼리만 병력을 나눌 수 있습니다.');
  amount = Math.min(Math.floor(amount), a.troops, maxTroops(g, toId) - b.troops);
  if (amount <= 0) return fail('옮길 수 있는 병력이 없습니다.');
  b.training = Math.round((b.training * b.troops + a.training * amount) / (b.troops + amount));
  a.troops -= amount;
  b.troops += amount;
  return ok(`${oname(g, fromId)} → ${oname(g, toId)} 병력 ${amount} 이동`);
}

// ───────────────────────────── 포로 ─────────────────────────────

export type CaptiveAction = 'recruit' | 'release' | 'execute';

export function handleCaptive(g: Game, faction: string, captiveId: string, action: CaptiveAction): Result {
  const t = g.s.officers[captiveId];
  if (!t || t.status !== 'captive' || t.captor !== faction) return fail('그런 포로가 없습니다.');
  const name = oname(g, captiveId);
  const ruler = g.s.factions[faction]!.ruler;
  if (action === 'recruit') {
    if (t.acted) return fail(`${name}은(는) 이번 달 이미 설득했습니다.`);
    t.acted = true;
    // 포로 등용 판정은 군주 매력 기준
    const p = recruitChance(g, ruler, captiveId);
    if (!g.rng.chance(p)) return ok(`${name}: "두 주인을 섬길 수는 없다!" (확률 ${p}%)`);
    const capital = g.s.factions[faction]!.capital;
    const city = g.s.cities[t.city]?.faction === faction ? t.city : capital;
    joinFaction(g, captiveId, faction, city);
    return ok(`${name}이(가) 투항했습니다.`);
  }
  if (action === 'release') {
    if (onRelease(g, captiveId, faction)) return ok(`${name}이(가) 마음으로 복종했습니다.`);
    releaseCaptive(g, captiveId);
    if (t.faction && g.s.factions[t.faction]?.alive) {
      const r = getRelation(g.s, faction, t.faction);
      r.friendship = clamp(r.friendship + 5, 0, 100);
    }
    return ok(`${name}을(를) 풀어주었습니다.`);
  }
  t.status = 'dead';
  t.captor = undefined;
  t.troops = 0;
  addLog(g.s, `${name} 처형됨 (${fname(g, faction)})`);
  // 처형은 자기 세력 의리 높은 무장들의 충성을 조금 떨어뜨림
  for (const o of officersOf(g, faction)) if (base(g, o.id).loyaltyTrait >= 13) o.loyalty = clamp(o.loyalty - 2, 0, 100);
  if (t.faction && g.s.factions[t.faction]?.alive) getRelation(g.s, faction, t.faction).friendship = 0;
  return ok(`${name}을(를) 처형했습니다.`);
}

export function releaseCaptive(g: Game, captiveId: string): void {
  const t = g.s.officers[captiveId]!;
  t.captor = undefined;
  t.troops = 0;
  const f = t.faction ? g.s.factions[t.faction] : undefined;
  if (f?.alive) {
    t.status = 'serving';
    t.city = f.capital;
    assignGovernor(g.s, f.capital);
  } else {
    t.status = 'free';
    t.faction = null;
    t.found = false;
  }
}

// ───────────────────────────── 외교 ─────────────────────────────

function diploActor(g: Game, officerId: string, target: string): OfficerState | string {
  const o = actor(g, officerId);
  if (typeof o === 'string') return o;
  if (!g.s.factions[target]?.alive || target === o.faction) return '대상 세력이 없습니다.';
  return o;
}

export function diploGift(g: Game, officerId: string, target: string, gold = 300): Result {
  const o = diploActor(g, officerId, target);
  if (typeof o === 'string') return fail(o);
  if (!spend(g, o.city, gold)) return fail('금이 부족합니다.');
  const b = base(g, officerId);
  const gain = Math.round((gold / 30) * (b.charisma / 80) + (b.skills.includes('diplomacy') ? 5 : 0) + g.rng.int(0, 3));
  const r = getRelation(g.s, o.faction!, target);
  r.friendship = clamp(r.friendship + gain, 0, 100);
  o.acted = true;
  return ok(`${b.name}: ${fname(g, target)}과(와) 친선 (우호 ${r.friendship})`);
}

/** AI가 제안을 받아들일지 판단 (플레이어가 AI에게 제안할 때) */
export function aiAccepts(g: Game, from: string, to: string, type: 'alliance' | 'truce' | 'surrender', envoy?: string): boolean {
  const r = getRelation(g.s, from, to);
  const mine = factionTotals(g, to);
  const theirs = factionTotals(g, from);
  const ratio = (theirs.power + 1) / (mine.power + 1);
  const eb = envoy ? base(g, envoy) : undefined;
  const bonus = eb ? (eb.charisma - 60) / 4 + (eb.intelligence - 60) / 8 + (eb.skills.includes('diplomacy') ? 8 : 0) : 0;
  if (type === 'alliance') return r.friendship >= 60 && g.rng.chance(r.friendship - 40 + bonus + (ratio > 1 ? 10 : 0));
  if (type === 'truce') return g.rng.chance(r.friendship * 0.6 + bonus + (ratio > 1.3 ? 25 : 0) - 10);
  // 항복: 압도적 열세 + 도시 수 적음
  if (mine.cities > 3 || ratio < 3) return false;
  return g.rng.chance(clamp((ratio - 3) * 15 + bonus + r.friendship / 4, 0, 70));
}

export function diploPropose(g: Game, officerId: string, target: string, type: 'alliance' | 'truce'): Result {
  const o = diploActor(g, officerId, target);
  if (typeof o === 'string') return fail(o);
  const r = getRelation(g.s, o.faction!, target);
  if (r.treaty === type) return fail('이미 그 관계입니다.');
  o.acted = true;
  if (!aiAccepts(g, o.faction!, target, type, officerId)) {
    r.friendship = clamp(r.friendship - 3, 0, 100);
    return ok(`${fname(g, target)}이(가) ${type === 'alliance' ? '동맹' : '정전'} 제안을 거절했습니다.`);
  }
  setTreaty(g, o.faction!, target, type);
  return ok(`${fname(g, target)}과(와) ${type === 'alliance' ? '동맹' : '정전'}을 맺었습니다!`);
}

export function setTreaty(g: Game, a: string, b: string, type: 'alliance' | 'truce' | 'none'): void {
  const r = getRelation(g.s, a, b);
  r.treaty = type;
  r.treatyMonths = type === 'alliance' ? 24 : type === 'truce' ? 12 : 0;
  if (type === 'alliance') r.friendship = Math.max(r.friendship, 70);
  addLog(g.s, `${fname(g, a)}-${fname(g, b)}: ${type === 'alliance' ? '동맹' : type === 'truce' ? '정전' : '관계 파기'}`);
}

export function diploSurrender(g: Game, officerId: string, target: string): Result {
  const o = diploActor(g, officerId, target);
  if (typeof o === 'string') return fail(o);
  o.acted = true;
  if (!aiAccepts(g, o.faction!, target, 'surrender', officerId)) return ok(`${fname(g, target)}이(가) 항복 권고를 거절했습니다.`);
  absorbFaction(g, target, o.faction!);
  return ok(`${fname(g, target)}이(가) 항복했습니다!`);
}

/** loser 세력의 모든 것이 winner에게 넘어간다 */
export function absorbFaction(g: Game, loser: string, winner: string): void {
  for (const c of citiesOf(g, loser)) c.faction = winner;
  for (const o of Object.values(g.s.officers)) {
    if (o.status === 'serving' && o.faction === loser) {
      o.faction = winner;
      o.loyalty = clamp(50 + base(g, o.id).loyaltyTrait * 2, 0, 100);
    }
    if (o.status === 'captive' && o.captor === loser) {
      if (o.faction === winner) {
        // 항복한 쪽에 잡혀 있던 아군 무장은 풀려나 복귀
        o.status = 'serving';
        o.captor = undefined;
        o.city = g.s.factions[winner]!.capital;
      } else o.captor = winner;
    }
  }
  g.s.factions[loser]!.alive = false;
  for (const c of citiesOf(g, winner)) assignGovernor(g.s, c.id);
  g.s.messages.push({ title: '항복', text: `${fname(g, loser)}이(가) ${fname(g, winner)}에 항복했습니다.`, kind: 'war' });
  addLog(g.s, `${fname(g, loser)} 멸망 (항복)`);
}

// ───────────────────────────── 계략 ─────────────────────────────

/** 유언비어 성공률 (%) */
export function rumorChance(g: Game, officerId: string, cityId: string): number {
  const b = base(g, officerId);
  const c = g.s.cities[cityId]!;
  const gov = c.governor ? base(g, c.governor) : undefined;
  return Math.round(clamp(50 + (b.intelligence - (gov?.intelligence ?? 40)) * 0.8 + (b.skills.includes('rumor') ? 20 : 0), 5, 95));
}

/** 이간 성공률 (%) */
export function discordChance(g: Game, officerId: string, targetId: string): number {
  const b = base(g, officerId);
  const tb = base(g, targetId);
  return Math.round(clamp(45 + (b.intelligence - tb.intelligence) * 0.7 - tb.loyaltyTrait * 2 + (b.skills.includes('sow_discord') ? 20 : 0), 5, 90));
}

/** 이간 대상 쿨다운 남은 개월 (0이면 가능) */
export function discordCooldown(g: Game, targetId: string): number {
  const last = g.s.flags[`sd_${targetId}`];
  if (typeof last !== 'number') return 0;
  return Math.max(0, last + 3 - (g.s.year * 12 + g.s.month));
}

export function rumor(g: Game, officerId: string, cityId: string): Result {
  const o = actor(g, officerId);
  if (typeof o === 'string') return fail(o);
  const c = g.s.cities[cityId];
  if (!c || !c.faction || c.faction === o.faction) return fail('적 도시를 선택하세요.');
  if (!spend(g, o.city, 50)) return fail('금이 부족합니다 (50).');
  o.acted = true;
  const p = rumorChance(g, officerId, cityId);
  if (!g.rng.chance(p)) return ok(`유언비어가 간파당했습니다. (확률 ${p}%)`);
  const d = g.rng.int(8, 18);
  c.order = clamp(c.order - d, 0, 100);
  c.support = clamp(c.support - Math.round(d / 2), 0, 100);
  return ok(`${cname(g, cityId)}에 유언비어가 퍼졌습니다! 치안 -${d}`);
}

export function sowDiscord(g: Game, officerId: string, targetId: string): Result {
  const o = actor(g, officerId);
  if (typeof o === 'string') return fail(o);
  const t = g.s.officers[targetId];
  if (!t || t.status !== 'serving' || !t.faction || t.faction === o.faction) return fail('적 무장을 선택하세요.');
  if (isRuler(g, targetId)) return fail('군주에게는 쓸 수 없습니다.');
  // 38장 안전핀: 같은 대상에게는 3개월에 한 번만 (경계 중)
  const cdLeft = discordCooldown(g, targetId);
  if (cdLeft > 0) return fail(`${oname(g, targetId)}은(는) 최근 이간을 당해 경계 중입니다 (${cdLeft}개월 후 가능).`);
  if (!spend(g, o.city, 50)) return fail('금이 부족합니다 (50).');
  o.acted = true;
  g.s.flags[`sd_${targetId}`] = g.s.year * 12 + g.s.month;
  const tb = base(g, targetId);
  const p = discordChance(g, officerId, targetId);
  if (!g.rng.chance(p)) return ok(`${tb.name}에 대한 이간이 실패했습니다. (확률 ${p}%)`);
  const d = g.rng.int(6, 15);
  t.loyalty = clamp(t.loyalty - d, 0, 100);
  return ok(`${tb.name}의 충성이 ${d} 떨어졌습니다. (현재 ${t.loyalty})`);
}

// ───────────────────────────── 군사 ─────────────────────────────

let battleSeq = 0;

/** 출진 준비. 성공하면 BattleSetup을 돌려준다 (전투는 war.ts에서 처리) */
export function prepareAttack(
  g: Game,
  faction: string,
  from: string,
  to: string,
  officerIds: string[],
  food: number,
): BattleSetup | string {
  const src = g.s.cities[from];
  const dst = g.s.cities[to];
  if (!src || !dst || src.faction !== faction) return '출발 도시가 올바르지 않습니다.';
  if (!isAdjacent(g, from, to)) return '인접한 도시만 공격할 수 있습니다.';
  if (dst.faction === faction) return '아군 도시입니다.';
  if (!canAttack(g, faction, dst.faction)) return '동맹/정전 중인 세력은 공격할 수 없습니다.';
  if (officerIds.length === 0 || officerIds.length > 5) return '출진 무장은 1~5명이어야 합니다.';
  const units: BattleSetup['units'] = [];
  for (const id of officerIds) {
    const o = g.s.officers[id];
    if (!o || o.status !== 'serving' || o.faction !== faction || o.city !== from) return `${oname(g, id)}은(는) 출진할 수 없습니다.`;
    if (o.acted) return `${oname(g, id)}은(는) 이번 달 이미 행동했습니다.`;
    if (o.troops <= 0) return `${oname(g, id)}에게 병력이 없습니다.`;
    units.push({ officer: id, troops: o.troops });
  }
  food = Math.floor(food);
  const troops = units.reduce((s, u) => s + u.troops, 0);
  // 전투 중 하루 소비량 = 병력/100 → 최소 10일분
  const minFood = Math.ceil(troops / 10);
  if (food < minFood) return `군량이 너무 적습니다 (최소 ${minFood}).`;
  if (food > src.food) return '도시의 군량이 부족합니다.';
  src.food -= food;
  for (const id of officerIds) g.s.officers[id]!.acted = true;
  return { id: `b${g.s.year}${g.s.month}_${battleSeq++}`, attacker: faction, defender: dst.faction, from, city: to, units, food };
}

/** 출진 판단용: 공격군 vs 수비군 전력비 */
export function attackOdds(g: Game, setup: Pick<BattleSetup, 'units' | 'city'>): number {
  const atk = armyPower(g, setup.units.map((u) => ({ ...g.s.officers[u.officer]!, troops: u.troops })));
  const c = g.s.cities[setup.city]!;
  const def = armyPower(g, officersIn(g, setup.city, c.faction)) * (1 + c.walls / 2500) + c.walls * 2;
  return (atk + 1) / (def + 1);
}
