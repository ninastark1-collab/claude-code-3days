import type { City, Officer } from '../data/schema';
import type { GameData } from '../data/validate';
import { Rng } from './rng';
import type { GameState } from './state';

/** 변하지 않는 원본 데이터에 빠르게 접근하기 위한 색인 */
export interface DataIndex {
  data: GameData;
  officer: Map<string, Officer>;
  city: Map<string, City>;
  adj: Map<string, { to: string; kind: 'land' | 'water' }[]>;
}

export function indexData(data: GameData): DataIndex {
  const adj = new Map<string, { to: string; kind: 'land' | 'water' }[]>(data.cities.map((c) => [c.id, []]));
  for (const [a, b, kind] of data.roads) {
    adj.get(a)?.push({ to: b, kind });
    adj.get(b)?.push({ to: a, kind });
  }
  return {
    data,
    officer: new Map(data.officers.map((o) => [o.id, o])),
    city: new Map(data.cities.map((c) => [c.id, c])),
    adj,
  };
}

/** 엔진 함수가 공통으로 받는 묶음: 원본 데이터 + 진행 상태 + 난수 */
export interface Game {
  ix: DataIndex;
  s: GameState;
  rng: Rng;
}

export function makeGame(ix: DataIndex, s: GameState): Game {
  return { ix, s, rng: new Rng(s) };
}

export function base(g: Game, officerId: string): Officer {
  const o = g.ix.officer.get(officerId);
  if (!o) throw new Error(`없는 무장: ${officerId}`);
  return o;
}

export function cityBase(g: Game, cityId: string): City {
  const c = g.ix.city.get(cityId);
  if (!c) throw new Error(`없는 도시: ${cityId}`);
  return c;
}

export const oname = (g: Game, id: string) => g.ix.officer.get(id)?.name ?? id;
export const cname = (g: Game, id: string) => g.ix.city.get(id)?.name ?? id;
export const fname = (g: Game, id: string | null) => (id ? g.s.factions[id]?.name ?? id : '재야');
