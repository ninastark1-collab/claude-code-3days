/**
 * A5: 설계노트 39장의 예외 상황 12개를 재현해 멈추거나 상태가 깨지지 않는지 확인
 * A6: 역사 이벤트가 한 판에 한 번만 발동하는지 확인
 */
import { loadGameData } from '../src/data/gameData';
import { createBattle, runDuel, setOrder, stepBattle, applyTactic } from '../src/engine/battle/battle';
import { autoResolve } from '../src/engine/battle/ai';
import type { BattleState } from '../src/engine/battle/types';
import { prepareAttack, setTreaty } from '../src/engine/commands';
import { indexData, makeGame, type Game } from '../src/engine/ctx';
import { createGameState } from '../src/engine/state';
import { checkEnding, finishMonth, runAiPhase, triageMessages } from '../src/engine/turn';
import { applyBattleResult, destroyFaction, killOfficer, refreshSetup, resolveAttackAuto } from '../src/engine/war';
import { citiesOf, officersIn } from '../src/engine/world';

const data = loadGameData();
const ix = indexData(data);
const newGame = (faction = 'liu_bei', seed = 5, scenario = 's194'): Game => makeGame(ix, createGameState(data, scenario, faction, seed));

function invariants(g: Game): void {
  for (const o of Object.values(g.s.officers)) {
    if (o.status === 'serving') {
      expect(g.s.factions[o.faction!]?.alive, `${o.id} faction alive`).toBe(true);
      expect(g.s.cities[o.city]?.faction, `${o.id} city owner`).toBe(o.faction);
    }
    if (o.status === 'captive') expect(g.s.factions[o.captor!]?.alive, `${o.id} captor`).toBe(true);
  }
  for (const f of Object.values(g.s.factions)) if (f.alive) expect(g.s.officers[f.ruler]?.status).toBe('serving');
}

/** 결과를 강제로 정한 전투 (특정 부대 상태 지정) */
function forcedBattle(g: Game, attacker: string, from: string, to: string, ids: string[], winner: 'atk' | 'def', statuses: Record<string, BattleState['units'][number]['status']>): void {
  const setup = prepareAttack(g, attacker, from, to, ids, 99999);
  if (typeof setup === 'string') throw new Error(setup);
  const b = createBattle(g, setup, null);
  for (const u of b.units) if (statuses[u.officer]) u.status = statuses[u.officer]!;
  b.result = { winner, reason: '테스트', units: b.units.map((u) => ({ officer: u.officer, side: u.side, troops: u.troops, status: u.status })), atkFoodLeft: 0 };
  applyBattleResult(g, b);
}

describe('A5: 39장 예외 상황', () => {
  it('1. 군주가 포로가 되면 후계자가 즉시 이어받는다', () => {
    const g = newGame('cao');
    g.s.cities.chenliu!.food = 99999;
    forcedBattle(g, 'cao', 'chenliu', 'puyang', ['cao_cao', 'xiahou_dun'], 'def', { cao_cao: 'captured' });
    expect(g.s.officers.cao_cao!.status).toBe('captive');
    expect(g.s.factions.cao!.alive).toBe(true);
    expect(g.s.factions.cao!.ruler).not.toBe('cao_cao');
    invariants(g);
  });

  it('2. 군주와 후계자가 같은 달에 죽어도 다음 후계자가 서거나 깔끔히 멸망한다', () => {
    const g = newGame('cao');
    killOfficer(g, 'cao_cao', '병사');
    const heir = g.s.factions.cao!.ruler;
    killOfficer(g, heir, '병사');
    expect(g.s.factions.cao!.alive).toBe(true);
    expect(g.s.officers[g.s.factions.cao!.ruler]!.status).toBe('serving');
    invariants(g);
  });

  it('3. 본거지가 함락돼도 남은 도시로 거점이 옮겨진다', () => {
    const g = newGame('cao');
    for (const o of officersIn(g, 'chenliu', 'cao')) o.troops = 0;
    g.s.cities.puyang!.food = 99999;
    const s = prepareAttack(g, 'lu_bu', 'puyang', 'chenliu', ['lu_bu'], 5000);
    if (typeof s === 'string') throw new Error(s);
    resolveAttackAuto(g, s);
    expect(g.s.cities.chenliu!.faction).toBe('lu_bu');
    expect(g.s.factions.cao!.alive).toBe(true);
    expect(g.s.cities[g.s.factions.cao!.capital]!.faction).toBe('cao');
    invariants(g);
  });

  it('4. 도시가 0개가 되면 세력이 멸망하고, 플레이어면 패배 엔딩', () => {
    const g = newGame('liu_bei');
    destroyFaction(g, 'liu_bei', 'cao');
    checkEnding(g);
    expect(g.s.ending?.type).toBe('defeat');
    invariants(g);
  });

  it('5. 동맹이 먼저 차지한 도시로 가던 공격은 취소된다', () => {
    const g = newGame('cao');
    setTreaty(g, 'cao', 'yuan_shao', 'alliance');
    g.s.cities.chenliu!.food = 99999;
    const s = prepareAttack(g, 'cao', 'chenliu', 'puyang', ['xiahou_dun'], 5000);
    if (typeof s === 'string') throw new Error(s);
    g.s.cities.puyang!.faction = 'yuan_shao'; // 그 사이 동맹이 점령
    expect(refreshSetup(g, s)).toBeNull();
  });

  it('6. 두 세력이 같은 달에 같은 빈 도시로 가면 먼저 간 쪽이 입성, 나중 쪽은 공성전', () => {
    const g = newGame('liu_bei');
    g.s.cities.luoyang!.faction = null;
    g.s.cities.chenliu!.food = 99999;
    const a = prepareAttack(g, 'cao', 'chenliu', 'luoyang', ['xiahou_dun'], 5000);
    const b = prepareAttack(g, 'li_jue', 'hongnong', 'luoyang', ['zhang_ji'], 3000);
    if (typeof a === 'string' || typeof b === 'string') throw new Error(String(a) + String(b));
    resolveAttackAuto(g, a);
    expect(g.s.cities.luoyang!.faction).toBe('cao');
    const b2 = refreshSetup(g, b);
    expect(b2?.defender).toBe('cao');
    resolveAttackAuto(g, b2!);
    invariants(g);
  });

  it('7. 출진 중 출발 도시를 잃으면 공격이 취소된다', () => {
    const g = newGame('cao');
    g.s.cities.chenliu!.food = 99999;
    const s = prepareAttack(g, 'cao', 'chenliu', 'puyang', ['xiahou_dun'], 5000);
    if (typeof s === 'string') throw new Error(s);
    g.s.cities.chenliu!.faction = 'lu_bu';
    expect(refreshSetup(g, s)).toBeNull();
  });

  it('8. 일기토로 장수가 죽어도 전투가 정상적으로 끝까지 진행된다', () => {
    const g = newGame('cao');
    g.s.cities.chenliu!.food = 99999;
    const s = prepareAttack(g, 'cao', 'chenliu', 'puyang', ['dian_wei', 'xiahou_dun'], 8000);
    if (typeof s === 'string') throw new Error(s);
    const b = createBattle(g, s, null);
    const atk = b.units.find((u) => u.officer === 'dian_wei')!;
    const def = b.units.find((u) => u.side === 'def')!;
    for (let i = 0; i < 20 && atk.status === 'active' && def.status === 'active'; i++) {
      atk.dueled = def.dueled = false;
      runDuel(b, atk, def);
    }
    autoResolve(b, stepBattle);
    expect(b.result).toBeTruthy();
    applyBattleResult(g, b);
    invariants(g);
  });

  it('9. 퇴로가 막힌 부대는 퇴각 명령 대신 버티고, 전투가 멈추지 않는다', () => {
    const g = newGame('cao');
    g.s.cities.chenliu!.food = 99999;
    const s = prepareAttack(g, 'cao', 'chenliu', 'puyang', ['xiahou_dun'], 5000);
    if (typeof s === 'string') throw new Error(s);
    const b = createBattle(g, s, 'atk');
    const u = b.units.find((x) => x.side === 'atk')!;
    // 서쪽 가장자리 열을 물로 막는다
    for (let y = 0; y < b.h; y++) for (let x = 0; x < u.x; x++) b.tiles[y * b.w + x] = { t: 'water' };
    setOrder(b, u.id, { type: 'retreat' });
    for (let i = 0; i < 20; i++) stepBattle(b);
    expect(u.order.type).toBe('hold');
    expect(b.log.some((l) => l.includes('퇴로가 막혀'))).toBe(true);
  });

  it('10. 화계가 아군 쪽으로 번져도 피해만 입고 멈추지 않는다', () => {
    const g = newGame('cao');
    g.s.cities.chenliu!.food = 99999;
    const s = prepareAttack(g, 'cao', 'chenliu', 'puyang', ['cao_cao', 'xiahou_dun'], 8000);
    if (typeof s === 'string') throw new Error(s);
    const b = createBattle(g, s, 'atk');
    b.weather = 'clear';
    const a = b.units.find((x) => x.side === 'atk')!;
    const ally = b.units.find((x) => x.side === 'atk' && x !== a)!;
    b.tiles[ally.y * b.w + ally.x]!.fire = 20; // 아군 칸에 불
    const t0 = ally.troops;
    for (let i = 0; i < 12; i++) stepBattle(b);
    expect(ally.troops).toBeLessThan(t0);
    void applyTactic;
  });

  it('11. 이벤트 대상이 먼저 죽으면 그 이벤트는 발동하지 않는다', () => {
    const g = newGame('liu_bei');
    killOfficer(g, 'zhuge_liang', '병사');
    g.s.year = 207;
    finishMonth(g);
    expect(g.s.flags.ev_three_visits).toBeUndefined();
    invariants(g);
  });

  it('12. 모든 무장은 생년이 있고 생년 ≤ 등장 ≤ 사망 순서다 (생년 불명 없음)', () => {
    for (const o of data.officers) {
      expect(Number.isInteger(o.birthYear), o.id).toBe(true);
      expect(o.birthYear <= o.debutYear && o.debutYear <= o.deathYear, o.id).toBe(true);
    }
  });
});

describe('B6: 알림 우선순위', () => {
  it('정보는 기록으로, 중요는 상단 알림으로, 팝업은 한 번에 3개를 넘지 않는다', () => {
    const g = newGame();
    const before = g.s.log.length;
    g.s.messages = [
      { title: '가을 수확', text: '…', kind: 'info' },
      { title: '조약 만료', text: '…', kind: 'notice' },
      { title: '도시 함락', text: 'A', kind: 'war' },
      { title: '도시 함락', text: 'B', kind: 'war' },
      { title: '삼고초려', text: '…', kind: 'event' },
      { title: '도시 함락', text: 'C', kind: 'war' },
      { title: '천하통일', text: '…', kind: 'ending' },
    ];
    triageMessages(g);
    expect(g.s.messages.length).toBeLessThanOrEqual(3);
    expect(g.s.messages[0]!.kind).toBe('ending');
    expect(g.s.messages.at(-1)!.title).toContain('그 외 알림');
    expect(g.s.notices).toEqual(['조약 만료: …']);
    expect(g.s.log.length).toBeGreaterThan(before);
  });
});

describe('A6: 역사 이벤트 중복 발동 방지', () => {
  it.each(['s194', 's200', 's208'])('%s: 30년 진행해도 각 이벤트는 한 번만 발동', (scenario) => {
    const sc = data.scenarios.find((s) => s.id === scenario)!;
    const g = newGame(sc.factions[0]!.id, 3, scenario);
    const once = ['도원결의', '소패왕 독립', '천자 옹립', '삼고초려', '동남풍', '서촉 지형도', '고평릉 정변', '칭제'];
    const count: Record<string, number> = {};
    for (let m = 0; m < 360 && !g.s.ending; m++) {
      const p = g.s.playerFaction;
      g.s.playerFaction = '__none__';
      runAiPhase(g);
      while (g.s.pendingBattles.length) resolveAttackAuto(g, g.s.pendingBattles.shift()!);
      g.s.playerFaction = p;
      finishMonth(g);
      for (const msg of g.s.messages) count[msg.title] = (count[msg.title] ?? 0) + 1;
      g.s.messages = [];
      g.s.proposals = [];
    }
    for (const t of once) expect(count[t] ?? 0, t).toBeLessThanOrEqual(1);
    void citiesOf;
  }, 180000);
});
