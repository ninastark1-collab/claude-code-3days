import { base, type Game } from './ctx';
import { getRelation, type CityState, type OfficerState } from './state';

/** 공통 조회/공식 모음 */

export function officersOf(g: Game, faction: string): OfficerState[] {
  return Object.values(g.s.officers).filter((o) => o.status === 'serving' && o.faction === faction);
}

export function officersIn(g: Game, city: string, faction?: string | null): OfficerState[] {
  return Object.values(g.s.officers).filter(
    (o) => o.status === 'serving' && o.city === city && (faction === undefined || o.faction === faction),
  );
}

export function freeOfficersIn(g: Game, city: string, onlyFound = false): OfficerState[] {
  return Object.values(g.s.officers).filter((o) => o.status === 'free' && o.city === city && (!onlyFound || o.found));
}

export function captivesOf(g: Game, faction: string): OfficerState[] {
  return Object.values(g.s.officers).filter((o) => o.status === 'captive' && o.captor === faction);
}

export function citiesOf(g: Game, faction: string): CityState[] {
  return Object.values(g.s.cities).filter((c) => c.faction === faction);
}

export function neighborsOf(g: Game, city: string) {
  return g.ix.adj.get(city) ?? [];
}

export function isAdjacent(g: Game, a: string, b: string): boolean {
  return neighborsOf(g, a).some((n) => n.to === b);
}

/** 두 세력이 서로 공격 가능한 관계인지 (동맹·정전이면 불가) */
export function canAttack(g: Game, a: string, b: string | null): boolean {
  if (!b) return true;
  if (a === b) return false;
  return getRelation(g.s, a, b).treaty === 'none';
}

/**
 * 가치관 거리 0(같은 생각)~75(정반대). 2축 좌표의 유클리드 거리를 0~75로 환산.
 * (좌표 거리 200 이상은 최대치로 본다)
 */
export function valuesDistance(a: readonly [number, number], b: readonly [number, number]): number {
  const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
  return Math.round(Math.min(75, (d * 75) / 200));
}

/** 무장 1명의 전투력 지표 */
export function officerPower(g: Game, o: OfficerState): number {
  const b = base(g, o.id);
  const skill = (b.leadership * 0.6 + b.war * 0.4) / 80;
  return o.troops * skill * (0.6 + o.training / 250);
}

export function armyPower(g: Game, list: OfficerState[]): number {
  return list.reduce((s, o) => s + officerPower(g, o), 0);
}

/** 도시 방어력 = 수비 무장 전투력 × 성벽 보정 */
export function cityDefense(g: Game, cityId: string): number {
  const c = g.s.cities[cityId]!;
  const defenders = officersIn(g, cityId, c.faction);
  return armyPower(g, defenders) * (1 + c.walls / 1500) + c.walls * 3;
}

export function factionTotals(g: Game, faction: string) {
  const cities = citiesOf(g, faction);
  const officers = officersOf(g, faction);
  return {
    cities: cities.length,
    officers: officers.length,
    troops: officers.reduce((s, o) => s + o.troops, 0),
    gold: cities.reduce((s, c) => s + c.gold, 0),
    food: cities.reduce((s, c) => s + c.food, 0),
    power: armyPower(g, officers),
  };
}

/** 월 금 수입 */
export function monthlyGold(c: CityState): number {
  const orderF = 0.5 + c.order / 200;
  return Math.round((c.commerce * 1.2 + c.population / 2000) * orderF);
}

/** 가을(9월) 군량 수확 */
export function harvestFood(c: CityState): number {
  const orderF = 0.5 + c.order / 200;
  return Math.round((c.agriculture * 60 + c.population / 40) * orderF);
}

/** 월 녹봉 (무장 1인당) */
export const SALARY = 15;
/** 병사 1000명당 월 군량 소비 */
export const FOOD_PER_1000 = 60;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 무장의 최대 지휘 병력 */
export function maxTroops(g: Game, officerId: string): number {
  const b = base(g, officerId);
  return Math.max(3000, Math.round((b.leadership * 200 + b.war * 50) / 1000) * 1000);
}

export function isRuler(g: Game, officerId: string): boolean {
  const o = g.s.officers[officerId];
  return !!o?.faction && g.s.factions[o.faction]?.ruler === officerId;
}

/** 세력 내 무장 이동 경로가 있는지 (자기 도시만 거쳐서) */
export function ownPathExists(g: Game, faction: string, from: string, to: string): boolean {
  if (from === to) return true;
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    for (const n of neighborsOf(g, cur)) {
      if (seen.has(n.to) || g.s.cities[n.to]?.faction !== faction) continue;
      if (n.to === to) return true;
      seen.add(n.to);
      q.push(n.to);
    }
  }
  return false;
}
