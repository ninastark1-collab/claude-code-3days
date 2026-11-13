import { loadGameData, neighbors } from '../src/data/gameData';
import { eraLabel } from '../src/data/eras';
import { checkConsistency, type GameData } from '../src/data/validate';
import { createGameState, relationKey } from '../src/engine/state';
import { Rng } from '../src/engine/rng';

describe('게임 데이터', () => {
  it('스키마 파싱 및 일관성 검사를 통과한다', () => {
    expect(checkConsistency(loadGameData())).toEqual([]);
  });

  it('잘못된 참조를 잡아낸다', () => {
    const data = loadGameData();
    const broken: GameData = structuredClone(data);
    broken.roads.push(['ye', 'nowhere', 'land']);
    broken.scenarios[0]!.officers.push({ officer: 'zhuge_liang', faction: 'cao', city: 'chenliu', troops: 0, loyalty: 80 });
    const errors = checkConsistency(broken);
    expect(errors.some((e) => e.includes('nowhere'))).toBe(true);
    expect(errors.some((e) => e.includes('zhuge_liang') && e.includes('207년 등장'))).toBe(true);
  });

  it('고립된 도시를 잡아낸다', () => {
    const broken: GameData = structuredClone(loadGameData());
    broken.roads = broken.roads.filter(([a, b]) => a !== 'yunnan' && b !== 'yunnan');
    expect(checkConsistency(broken).some((e) => e.includes('yunnan'))).toBe(true);
  });

  it('194년 시나리오 규모', () => {
    const data = loadGameData();
    const s = data.scenarios.find((x) => x.id === 's194')!;
    expect(data.cities.length).toBeGreaterThanOrEqual(45);
    expect(s.officers.length).toBeGreaterThanOrEqual(120);
    expect(neighbors(data, 'xiangyang').map((n) => n.to).sort()).toEqual(['jiangling', 'jiangxia', 'xinye']);
  });
});

describe('게임 상태 생성', () => {
  const data = loadGameData();
  const state = createGameState(data, 's194', 'liu_bei', 42);

  it('시나리오 배치대로 무장/도시 상태를 만든다', () => {
    expect(state.year).toBe(194);
    expect(state.officers.guan_yu).toMatchObject({ faction: 'liu_bei', city: 'xiapi', status: 'serving' });
    expect(state.officers.zhao_yun).toMatchObject({ faction: 'gongsun_zan', city: 'beiping' });
    expect(state.officers.zhou_yu).toMatchObject({ faction: null, status: 'free', city: 'lujiang' });
    expect(state.officers.sun_jian?.status).toBe('dead');
    expect(state.officers.zhuge_liang?.status).toBe('unborn');
    expect(state.cities.xiapi?.governor).toBe('liu_bei');
    expect(state.cities.xiaopei?.governor).toBe('zhang_fei');
  });

  it('외교 관계는 모든 세력 쌍에 존재한다', () => {
    const n = Object.keys(state.factions).length;
    expect(Object.keys(state.relations)).toHaveLength((n * (n - 1)) / 2);
    expect(state.relations[relationKey('yuan_shao', 'cao')]).toMatchObject({ treaty: 'alliance', friendship: 70 });
  });
});

describe('연호·지역 표기 (A4)', () => {
  it('연호표 32-2와 일치한다', () => {
    expect(eraLabel(184)).toBe('중평 원년');
    expect(eraLabel(188)).toBe('중평 5년');
    expect(eraLabel(189)).toBe('광희·소녕·영한 원년');
    expect(eraLabel(190)).toBe('초평 원년');
    expect(eraLabel(194)).toBe('흥평 원년');
    expect(eraLabel(196)).toBe('건안 원년');
    expect(eraLabel(208)).toBe('건안 13년');
    expect(eraLabel(220)).toBe('연강 원년');
    expect(eraLabel(221, 'wei')).toBe('황초 2년');
    expect(eraLabel(221, 'shu')).toBe('장무 원년');
    expect(eraLabel(221, 'wu')).toBe('황초 2년'); // 오는 222년 황무 개원 전까지 위 연호
    expect(eraLabel(222, 'wu')).toBe('황무 원년');
  });

  it('양주 두 곳은 한자로 구분하고, 사예는 사예(司隸)로 표기한다', () => {
    const regions = new Set(loadGameData().cities.map((c) => c.region));
    expect(regions.has('양주(揚)')).toBe(true);
    expect(regions.has('양주(涼)')).toBe(true);
    expect(regions.has('사예(司隸)')).toBe(true);
    expect(regions.has('양주')).toBe(false);
    expect(regions.has('사례')).toBe(false);
  });
});

describe('Rng', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    const a = new Rng({ rngState: 7 });
    const b = new Rng({ rngState: 7 });
    const seqA = Array.from({ length: 5 }, () => a.int(1, 100));
    const seqB = Array.from({ length: 5 }, () => b.int(1, 100));
    expect(seqA).toEqual(seqB);
    expect(seqA.every((n) => n >= 1 && n <= 100)).toBe(true);
  });
});
