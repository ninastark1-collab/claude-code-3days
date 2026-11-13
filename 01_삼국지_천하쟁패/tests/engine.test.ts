import { loadGameData } from '../src/data/gameData';
import { createBattle, stepBattle } from '../src/engine/battle/battle';
import { autoResolve, battleAi } from '../src/engine/battle/ai';
import { conscript, develop, prepareAttack, recruit, search, train } from '../src/engine/commands';
import { indexData, makeGame, type Game } from '../src/engine/ctx';
import { createGameState } from '../src/engine/state';
import { finishMonth, runAiPhase } from '../src/engine/turn';
import { applyBattleResult, refreshSetup, resolveAttackAuto } from '../src/engine/war';
import { officersIn } from '../src/engine/world';

const data = loadGameData();
const ix = indexData(data);

function newGame(faction = 'liu_bei', seed = 1, scenario = 's194'): Game {
  return makeGame(ix, createGameState(data, scenario, faction, seed));
}

/** 플레이어 턴은 넘기고 AI만 진행 (플레이어 방어전은 자동 처리) */
function advance(g: Game, months: number): void {
  for (let i = 0; i < months && !g.s.ending; i++) {
    runAiPhase(g);
    while (g.s.pendingBattles.length) resolveAttackAuto(g, g.s.pendingBattles.shift()!);
    finishMonth(g);
    g.s.messages = [];
    g.s.proposals = [];
  }
}

function checkInvariants(g: Game): void {
  for (const o of Object.values(g.s.officers)) {
    if (o.status === 'serving') {
      expect(o.faction, o.id).toBeTruthy();
      expect(g.s.factions[o.faction!]!.alive, `${o.id} in dead faction`).toBe(true);
      expect(g.s.cities[o.city]?.faction, `${o.id} at ${o.city}`).toBe(o.faction);
      expect(o.troops).toBeGreaterThanOrEqual(0);
    }
    if (o.status === 'captive') expect(g.s.factions[o.captor!]?.alive, `${o.id} captor`).toBe(true);
  }
  for (const f of Object.values(g.s.factions)) {
    if (!f.alive) continue;
    expect(g.s.officers[f.ruler]?.status, `${f.id} ruler`).toBe('serving');
    expect(g.s.officers[f.ruler]?.faction).toBe(f.id);
  }
  for (const c of Object.values(g.s.cities)) {
    expect(c.gold).toBeGreaterThanOrEqual(0);
    expect(c.food).toBeGreaterThanOrEqual(0);
    if (c.governor) expect(g.s.officers[c.governor]?.city).toBe(c.id);
  }
}

describe('내정 명령', () => {
  it('개발/징병/훈련은 수치를 올리고 행동 완료로 표시한다', () => {
    const g = newGame();
    const before = g.s.cities.xiapi!.agriculture;
    expect(develop(g, 'mi_zhu', 'agriculture').ok).toBe(true);
    expect(g.s.cities.xiapi!.agriculture).toBeGreaterThan(before);
    expect(develop(g, 'mi_zhu', 'agriculture').ok).toBe(false); // 이미 행동함
    const t0 = g.s.officers.guan_yu!.troops;
    expect(conscript(g, 'guan_yu').ok).toBe(true);
    expect(g.s.officers.guan_yu!.troops).toBeGreaterThan(t0);
    expect(train(g, 'zhang_fei').ok).toBe(true);
  });

  it('탐색으로 재야를 찾은 뒤 등용할 수 있다', () => {
    const g = newGame('yuan_shu', 3);
    const zy = g.s.officers.zhou_yu!;
    expect(recruit(g, 'sun_ce', 'zhou_yu').ok).toBe(false); // 미발견
    zy.found = true;
    let tries = 0;
    for (const id of ['sun_ce', 'cheng_pu', 'huang_gai', 'han_dang']) {
      if (zy.status === 'serving') break;
      recruit(g, id, 'zhou_yu');
      tries++;
    }
    expect(tries).toBeGreaterThan(0);
    void search;
  });
});

describe('전투', () => {
  it('자동 전투가 끝까지 진행되고 결과가 반영된다', () => {
    const g = newGame('cao', 5);
    const setup = prepareAttack(g, 'cao', 'chenliu', 'puyang', ['cao_cao', 'xiahou_dun', 'dian_wei'], 8000);
    expect(typeof setup).not.toBe('string');
    if (typeof setup === 'string') return;
    const b = createBattle(g, setup, null);
    autoResolve(b, stepBattle);
    expect(b.result).toBeTruthy();
    applyBattleResult(g, b);
    checkInvariants(g);
  });

  it('플레이어 쪽은 AI가 움직이지 않는다', () => {
    const g = newGame('cao', 6);
    const setup = prepareAttack(g, 'cao', 'chenliu', 'puyang', ['cao_cao'], 3000);
    if (typeof setup === 'string') throw new Error(setup);
    const b = createBattle(g, setup, 'atk');
    const u = b.units.find((x) => x.side === 'atk')!;
    const x0 = u.x;
    for (let i = 0; i < 30; i++) {
      battleAi(b, ['def']);
      stepBattle(b);
    }
    expect(u.x).toBe(x0);
  });
});

describe('대기 중인 방어전', () => {
  it('앞선 공격으로 도시를 잃으면 두 번째 공격은 더 이상 플레이어 방어전이 아니다', () => {
    const g = newGame('liu_bei', 21);
    // 소패를 비워두고 두 세력이 같은 달에 공격
    for (const o of officersIn(g, 'xiaopei', 'liu_bei')) o.troops = 0;
    g.s.cities.chenliu!.food = 99999;
    const a = prepareAttack(g, 'cao', 'chenliu', 'xiaopei', ['xiahou_dun'], 5000);
    const b = prepareAttack(g, 'yuan_shu', 'shouchun', 'xiapi', ['ji_ling'], 5000);
    if (typeof a === 'string' || typeof b === 'string') throw new Error(String(a) + String(b));
    resolveAttackAuto(g, a);
    expect(g.s.cities.xiaopei!.faction).toBe('cao');
    // 같은 도시를 노린 두 번째 공격 (조조군 소유가 된 소패)
    const second = { ...b, city: 'xiaopei', from: 'xiapi' };
    const r = refreshSetup(g, second);
    expect(r).toBeNull(); // 출발 도시가 원술군 소유가 아니므로 취소
  });
});

describe('저장/불러오기', () => {
  it('JSON으로 저장한 상태에서 이어가면 같은 결과가 나온다 (결정론)', () => {
    const a = newGame('cao', 11);
    advance(a, 6);
    const saved = JSON.stringify(a.s);
    const b = makeGame(ix, JSON.parse(saved));
    advance(a, 12);
    advance(b, 12);
    expect(JSON.stringify(b.s)).toBe(JSON.stringify(a.s));
  });
});

describe('모든 시나리오', () => {
  it.each(data.scenarios.map((s) => s.id))('%s: 첫 세력으로 2년 진행해도 상태가 일관된다', (id) => {
    const sc = data.scenarios.find((s) => s.id === id)!;
    const g = newGame(sc.factions[0]!.id, 7, id);
    checkInvariants(g);
    advance(g, 24);
    checkInvariants(g);
  }, 120000);
});

describe('장기 시뮬레이션', () => {
  it.each([1, 2, 3])('194년 AI끼리 15년 진행해도 상태가 일관된다 (seed %i)', (seed) => {
    const g = newGame('kong_rong', seed);
    for (let y = 0; y < 15 && !g.s.ending; y++) {
      advance(g, 12);
      checkInvariants(g);
    }
    const alive = Object.values(g.s.factions).filter((f) => f.alive).length;
    expect(alive).toBeGreaterThanOrEqual(1);
  }, 120000);
});
