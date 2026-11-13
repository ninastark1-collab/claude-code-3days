import officersBase from '../../data/officers.json';
import officersExt from '../../data/officers-ext.json';
import cities from '../../data/cities.json';
import roads from '../../data/roads.json';
import s194 from '../../data/scenarios/s194.json';
import s184 from '../../data/scenarios/s184.json';
import s190 from '../../data/scenarios/s190.json';
import s200 from '../../data/scenarios/s200.json';
import s208 from '../../data/scenarios/s208.json';
import s219 from '../../data/scenarios/s219.json';
import { parseGameData, type GameData } from './validate';

const officers: unknown[] = [...officersBase, ...officersExt];

/** 번들된 게임 데이터 (앱/테스트/검증 스크립트 공용) */
export function loadGameData(): GameData {
  return parseGameData({ officers, cities, roads, scenarios: [s194, s184, s190, s200, s208, s219] });
}

/** 도시의 인접 도시 목록 */
export function neighbors(data: GameData, cityId: string): { to: string; kind: 'land' | 'water' }[] {
  const out: { to: string; kind: 'land' | 'water' }[] = [];
  for (const [a, b, kind] of data.roads) {
    if (a === cityId) out.push({ to: b, kind });
    else if (b === cityId) out.push({ to: a, kind });
  }
  return out;
}
