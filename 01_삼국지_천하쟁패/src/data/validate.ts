import { z } from 'zod';
import {
  CitySchema,
  OfficerSchema,
  RoadSchema,
  ScenarioSchema,
  type City,
  type Officer,
  type Road,
  type Scenario,
} from './schema';

export interface GameData {
  officers: Officer[];
  cities: City[];
  roads: Road[];
  scenarios: Scenario[];
}

/** 원본 JSON을 스키마로 파싱. 형식 오류는 예외로 던짐 */
export function parseGameData(raw: { officers: unknown; cities: unknown; roads: unknown; scenarios: unknown[] }): GameData {
  return {
    officers: z.array(OfficerSchema).parse(raw.officers),
    cities: z.array(CitySchema).parse(raw.cities),
    roads: z.array(RoadSchema).parse(raw.roads),
    scenarios: raw.scenarios.map((s) => ScenarioSchema.parse(s)),
  };
}

function findDuplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const i of ids) (seen.has(i) ? dup : seen).add(i);
  return [...dup];
}

/** 데이터 간 참조·연도 일관성 검사. 문제 목록을 반환 (빈 배열이면 정상) */
export function checkConsistency(data: GameData): string[] {
  const errors: string[] = [];
  const officerById = new Map(data.officers.map((o) => [o.id, o]));
  const cityIds = new Set(data.cities.map((c) => c.id));

  for (const d of findDuplicates(data.officers.map((o) => o.id))) errors.push(`무장 id 중복: ${d}`);
  for (const d of findDuplicates(data.cities.map((c) => c.id))) errors.push(`도시 id 중복: ${d}`);

  for (const o of data.officers) {
    if (!(o.birthYear <= o.debutYear && o.debutYear <= o.deathYear))
      errors.push(`무장 ${o.name}(${o.id}): 생년<=등장<=사망 순서가 아님`);
    for (const ref of [o.father, o.spouse]) {
      if (ref && !officerById.has(ref)) errors.push(`무장 ${o.id}: 없는 무장 참조 ${ref}`);
    }
    if (!o.homeCity) errors.push(`무장 ${o.name}(${o.id}): homeCity 누락`);
    else if (!cityIds.has(o.homeCity)) errors.push(`무장 ${o.id}: 없는 고향 도시 ${o.homeCity}`);
  }

  // 길: 양 끝 도시 존재, 자기 자신/중복 금지, 전체 도시가 하나로 연결
  const cityById = new Map(data.cities.map((c) => [c.id, c]));
  const roadKeys = new Set<string>();
  const adj = new Map<string, string[]>(data.cities.map((c) => [c.id, []]));
  for (const [a, b] of data.roads) {
    if (!cityById.has(a) || !cityById.has(b)) {
      errors.push(`길 ${a}-${b}: 없는 도시`);
      continue;
    }
    if (a === b) errors.push(`길 ${a}-${b}: 자기 자신과 연결`);
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (roadKeys.has(key)) errors.push(`길 중복: ${a}-${b}`);
    roadKeys.add(key);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  const first = data.cities[0];
  if (first) {
    const seen = new Set([first.id]);
    const queue = [first.id];
    while (queue.length) for (const n of adj.get(queue.shift()!)!) if (!seen.has(n)) (seen.add(n), queue.push(n));
    for (const c of data.cities) if (!seen.has(c.id)) errors.push(`도시 ${c.id}(${c.name}): 다른 도시와 연결되지 않음`);
  }

  for (const s of data.scenarios) {
    const p = `시나리오 ${s.id}`;
    const factionIds = new Set(s.factions.map((f) => f.id));
    for (const d of findDuplicates(s.factions.map((f) => f.id))) errors.push(`${p}: 세력 id 중복 ${d}`);
    for (const d of findDuplicates(s.cities.map((c) => c.city))) errors.push(`${p}: 도시 중복 배치 ${d}`);
    for (const d of findDuplicates(s.officers.map((o) => o.officer))) errors.push(`${p}: 무장 중복 배치 ${d}`);

    const cityOwner = new Map(s.cities.map((c) => [c.city, c.faction]));
    for (const c of s.cities) {
      if (!cityIds.has(c.city)) errors.push(`${p}: 없는 도시 ${c.city}`);
      if (c.faction && !factionIds.has(c.faction)) errors.push(`${p}: 도시 ${c.city}의 세력 ${c.faction} 없음`);
      const base = cityById.get(c.city);
      if (base) {
        if (c.population > base.maxPopulation) errors.push(`${p}: ${c.city} 인구가 최대치 초과`);
        if (c.agriculture > base.maxAgriculture) errors.push(`${p}: ${c.city} 농업이 최대치 초과`);
        if (c.commerce > base.maxCommerce) errors.push(`${p}: ${c.city} 상업이 최대치 초과`);
        if (c.walls > base.maxWalls) errors.push(`${p}: ${c.city} 성벽이 최대치 초과`);
      }
    }
    for (const c of data.cities) {
      if (!cityOwner.has(c.id)) errors.push(`${p}: 도시 ${c.id} 시작 상태 누락`);
    }

    const placed = new Map(s.officers.map((o) => [o.officer, o]));
    for (const o of s.officers) {
      const base = officerById.get(o.officer);
      if (!base) {
        errors.push(`${p}: 없는 무장 ${o.officer}`);
        continue;
      }
      if (!cityIds.has(o.city)) errors.push(`${p}: 무장 ${o.officer}의 도시 ${o.city} 없음`);
      if (o.faction) {
        if (!factionIds.has(o.faction)) errors.push(`${p}: 무장 ${o.officer}의 세력 ${o.faction} 없음`);
        else if (cityOwner.get(o.city) !== o.faction)
          errors.push(`${p}: 무장 ${o.officer}가 자기 세력이 아닌 도시 ${o.city}에 있음`);
        if (base.debutYear > s.year) errors.push(`${p}: 무장 ${o.officer}는 ${base.debutYear}년 등장인데 소속으로 배치됨`);
      } else if (base.debutYear > s.year) {
        errors.push(`${p}: 무장 ${o.officer}는 ${base.debutYear}년 등장인데 재야로 배치됨`);
      }
      if (base.deathYear < s.year) errors.push(`${p}: 무장 ${o.officer}는 ${base.deathYear}년 사망`);
    }

    for (const f of s.factions) {
      const ruler = placed.get(f.ruler);
      if (!ruler) errors.push(`${p}: 세력 ${f.id}의 군주 ${f.ruler} 미배치`);
      else if (ruler.faction !== f.id) errors.push(`${p}: 군주 ${f.ruler}가 세력 ${f.id} 소속이 아님`);
      if (cityOwner.get(f.capital) !== f.id) errors.push(`${p}: 세력 ${f.id}의 거점 ${f.capital}을 보유하지 않음`);
    }

    for (const r of s.relations) {
      if (!factionIds.has(r.a) || !factionIds.has(r.b)) errors.push(`${p}: 외교관계에 없는 세력 ${r.a}/${r.b}`);
    }
  }
  return errors;
}
