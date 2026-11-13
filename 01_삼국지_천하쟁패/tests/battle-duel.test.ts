/**
 * 전투개편 v2 1단계: 자동 전투 일기토 + 연출 큐 (v2 설계서 9장·10장·11장 1순위)
 */
import { loadGameData } from '../src/data/gameData';
import { preparePlannedBattle, runPlannedBattle, setPlan, startPlannedBattle, tickPlanned } from '../src/engine/battle/auto';
import { createBattle } from '../src/engine/battle/battle';
import { DUEL_MATCHUPS, duelHighlights, matchupOf } from '../src/engine/battle/duel';
import { defaultPlan } from '../src/engine/battle/plan';
import { battleReport } from '../src/engine/battle/report';
import type { BattleState, Cinematic } from '../src/engine/battle/types';
import { prepareAttack } from '../src/engine/commands';
import { indexData, makeGame, type Game } from '../src/engine/ctx';
import { createGameState } from '../src/engine/state';
import { neighborsOf, officersIn } from '../src/engine/world';

const data = loadGameData();
const ix = indexData(data);

/** probe-duel 과 같은 방식: s194 각 도시 → 이웃 적 도시 */
function sampleBattles(maxN: number, seeds = 12): BattleState[] {
  const out: BattleState[] = [];
  for (let seed = 1; seed <= seeds && out.length < maxN; seed++) {
    const g: Game = makeGame(ix, createGameState(data, 's194', 'cao', seed));
    for (const c of Object.values(g.s.cities)) {
      if (!c.faction || out.length >= maxN) continue;
      const atk = officersIn(g, c.id, c.faction).filter((o) => o.troops > 0).slice(0, 5);
      if (!atk.length) continue;
      for (const n of neighborsOf(g, c.id)) {
        const t = g.s.cities[n.to]!;
        if (!t.faction || t.faction === c.faction || !officersIn(g, t.id, t.faction).some((o) => o.troops > 0)) continue;
        const troops = atk.reduce((s, o) => s + o.troops, 0);
        const b = createBattle(g, { id: 't', attacker: c.faction, defender: t.faction, from: c.id, city: t.id, units: atk.map((o) => ({ officer: o.id, troops: o.troops })), food: Math.ceil(troops / 10) * 3 }, null);
        preparePlannedBattle(b, ['atk', 'def']);
        out.push(b);
        if (out.length >= maxN) break;
      }
    }
  }
  return out;
}

describe('자동 전투 일기토', () => {
  it('무력 85+ 장수가 참전한 전투의 상당수(30~70%)에서 일기토가 일어난다 (정식 측정은 qa/scripts/probe-duel.mts)', () => {
    const bs = sampleBattles(120);
    let strong = 0;
    let withDuel = 0;
    for (const b of bs) {
      runPlannedBattle(b);
      if (b.units.some((u) => u.war >= 85)) {
        strong++;
        if (b.duels.length) withDuel++;
      }
    }
    expect(strong).toBeGreaterThan(30);
    const rate = withDuel / strong;
    expect(rate).toBeGreaterThan(0.3);
    expect(rate).toBeLessThan(0.7);
  }, 60_000);

  it('일어난 일기토는 100% 연출 큐에 장면으로 들어간다', () => {
    let duels = 0;
    for (const b of sampleBattles(60)) {
      startPlannedBattle(b);
      const seen: Cinematic[] = [];
      for (let i = 0; i < 2400 && !b.result; i++) {
        tickPlanned(b, 1);
        // 관전 화면처럼 큐를 꺼낸다
        while (b.cinematics?.length) seen.push(b.cinematics.shift()!);
      }
      const shown = seen.filter((c) => c.kind === 'duel').map((c) => (c as { duel: number }).duel);
      expect(shown).toEqual(b.duels.map((_, i) => i));
      duels += b.duels.length;
    }
    expect(duels).toBeGreaterThan(0);
  }, 60_000);

  it('일기토를 거절로 정하면 그 장수는 일기토를 받지 않는다', () => {
    for (const b of sampleBattles(40)) {
      setPlan(b, 'atk', b.plans!.atk!);
      const dp = b.plans!.def!;
      for (const up of Object.values(dp.units)) up.duel = 'refuse';
      for (const up of Object.values(b.plans!.atk!.units)) if (up.duel === 'seek') up.duel = 'refuse';
      runPlannedBattle(b);
      expect(b.duels.length).toBe(0);
    }
  });

  it('일기토 기록에 재생에 필요한 정보(장수 id·무력·사기 변화)가 남는다', () => {
    const b = sampleBattles(80).find((x) => (runPlannedBattle(x), x.duels.length > 0))!;
    const d = b.duels[0]!;
    expect(d.aId && d.bId).toBeTruthy();
    expect(d.aWar).toBeGreaterThanOrEqual(80);
    expect(['dead', 'captured', 'routed', 'draw']).toContain(d.fate);
    // 결과 보고서 맨 위 일기토 카드
    const rep = battleReport(b, 'atk');
    expect(rep.duels.length).toBe(b.duels.length);
    expect(rep.duels[0]!.outcome).toBe(d.outcome);
  });
});

describe('일기토 재생 합 고르기', () => {
  it('40합 중 결정적인 합만 5~12개, 첫 합과 마지막 합(결정타)은 꼭 들어간다', () => {
    const rounds = Array.from({ length: 30 }, (_, i) => ({ aHp: 100 - i * 3, bHp: 100 - i * 3.4, text: `${i + 1}합: 서로 칼을 맞부딪친다` }));
    const h = duelHighlights(rounds);
    expect(h.length).toBeGreaterThanOrEqual(5);
    expect(h.length).toBeLessThanOrEqual(12);
    expect(h[0]).toBe(0);
    expect(h[h.length - 1]).toBe(29);
    expect([...h].sort((a, c) => a - c)).toEqual(h);
  });
});

describe('연의 매치업', () => {
  it('초안 JSON의 매치업과 설계서 9-2 조합이 들어 있고, 순서와 상관없이 찾는다', () => {
    expect(DUEL_MATCHUPS.length).toBeGreaterThanOrEqual(15);
    expect(matchupOf('hua_xiong', 'guan_yu')?.flip).toBe(true);
    expect(matchupOf('guan_yu', 'yan_liang')?.m.lineA).toBeTruthy();
    for (const m of DUEL_MATCHUPS) {
      expect(ix.officer.get(m.a), m.a).toBeTruthy();
      expect(ix.officer.get(m.b), m.b).toBeTruthy();
    }
  });

  it('매치업 두 장수가 같은 전장에서 맞붙으면 전용 대사로 일기토가 일어나기 쉽다', () => {
    let hit = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g: Game = makeGame(ix, createGameState(data, 's194', 'cao', seed));
      // 관우를 조조군 장수로 옮겨 여포 쪽 도시를 치게 한다 (호뢰관 삼영전 매치업)
      const gy = g.s.officers.guan_yu!;
      gy.faction = 'cao';
      gy.city = 'chenliu';
      gy.status = 'serving';
      gy.troops = 8000;
      const lb = g.s.officers.lu_bu!;
      const setup = prepareAttack(g, 'cao', 'chenliu', lb.city, ['guan_yu'], 20000);
      if (typeof setup === 'string') continue;
      const b = createBattle(g, setup, null);
      preparePlannedBattle(b, ['atk', 'def']);
      setPlan(b, 'atk', defaultPlan(b, 'atk', 'atk_front', true));
      runPlannedBattle(b);
      if (b.duels.some((d) => d.lineA && [d.a, d.b].includes('관우') && [d.a, d.b].includes('여포'))) hit++;
    }
    expect(hit).toBeGreaterThan(0);
  });
});

describe('관전 템포 (사용자 요청 2026-11-13: 붙자마자 끝나지 않게, 일기토는 한 전투 한 번 정도)', () => {
  it('한 전투의 일기토는 최대 1번이고, 첫 충돌 뒤 이틀(24틱)이 지나야 일어난다', async () => {
    const { MAX_DUELS, DUEL_AFTER_CLASH } = await import('../src/engine/battle/duel');
    expect(MAX_DUELS).toBe(1);
    let duels = 0;
    for (const b of sampleBattles(60)) {
      runPlannedBattle(b);
      expect(b.duels.length).toBeLessThanOrEqual(1);
      for (const d of b.duels) {
        duels++;
        expect(d.tick! - b.firstClash!).toBeGreaterThanOrEqual(DUEL_AFTER_CLASH);
      }
    }
    expect(duels).toBeGreaterThan(0); // 일기토 자체는 계속 일어난다
  }, 60000);

  it('일기토에서 달아난 장수의 부대는 바로 사라지지 않고 퇴각한다 (추격 장면)', async () => {
    const { runDuel, createBattle: cb } = await import('../src/engine/battle/battle');
    const g: Game = makeGame(ix, createGameState(data, 's194', 'cao', 1));
    const s = prepareAttack(g, 'cao', 'chenliu', 'puyang', ['cao_cao', 'xiahou_dun'], 8000);
    if (typeof s === 'string') throw new Error(s);
    for (let i = 0; i < 400; i++) {
      const b = cb(g, s, 'atk');
      b.rngState = i * 7919 + 1;
      const a = b.units.find((u) => u.side === 'atk')!;
      const d = b.units.find((u) => u.side === 'def')!;
      const log = runDuel(b, a, d);
      if (log.fate !== 'routed') continue;
      const loser = log.winner === a.name ? d : a;
      expect(loser.status).toBe('active');
      expect(loser.order.type).toBe('retreat');
      return;
    }
    throw new Error('달아남 결과를 400번 안에 못 찾음');
  });

  it('관전 화면은 승패가 나도 종료 연출 뒤에 결과창을 연다', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/ui/screens/Battle.tsx', 'utf-8');
    expect(src).toMatch(/OUTRO_MS = \d{4}/);
    expect(src).toContain("{b.result && outro === 'done' && <BattleResult");
  });
});
