/**
 * 전투 수정 요청 2026-11-13 (APK 전 4가지): 자동 병과 규칙 ②, 수비 병과 선택 ③, 충차대 ④
 * (농성 배치 ①은 battle-plan.test.ts)
 */
import { readFileSync } from 'node:fs';
import { loadGameData } from '../src/data/gameData';
import { preparePlannedBattle, setPlan, startPlannedBattle, tickPlanned } from '../src/engine/battle/auto';
import { activeUnits, createBattle } from '../src/engine/battle/battle';
import { RAM, targetMix } from '../src/engine/battle/kinds';
import { defaultPlan } from '../src/engine/battle/plan';
import type { DefPolicy, UnitKind } from '../src/engine/battle/types';
import { prepareAttack } from '../src/engine/commands';
import { indexData, makeGame } from '../src/engine/ctx';
import { createGameState } from '../src/engine/state';

const data = loadGameData();
const ix = indexData(data);
const make = (seed = 1, kinds?: Record<string, UnitKind>) => {
  const g = makeGame(ix, createGameState(data, 's194', 'cao', seed));
  g.s.cities.chenliu!.food = 99999;
  const offs = Object.values(g.s.officers).filter((o) => o.faction === 'cao' && o.city === 'chenliu' && o.status === 'serving' && o.troops > 0).slice(0, 5);
  const s = prepareAttack(g, 'cao', 'chenliu', 'puyang', offs.map((o) => o.id), 20000);
  if (typeof s === 'string') throw new Error(s);
  return createBattle(g, s, 'atk', kinds);
};
const count = (ks: UnitKind[]) => ({ infantry: ks.filter((k) => k === 'infantry').length, cavalry: ks.filter((k) => k === 'cavalry').length, archer: ks.filter((k) => k === 'archer').length });
const start = (pol: DefPolicy, kinds?: Record<string, UnitKind>) => {
  const b = make(1, kinds);
  preparePlannedBattle(b, []);
  setPlan(b, 'atk', defaultPlan(b, 'atk', 'atk_front'));
  setPlan(b, 'def', defaultPlan(b, 'def', pol));
  startPlannedBattle(b);
  return b;
};

describe('② 자동 병과', () => {
  it('"무력 85 이상 = 기병" 규칙이 없다', () => {
    expect(readFileSync('src/engine/battle/battle.ts', 'utf-8')).not.toMatch(/war >= 85 \? 'cavalry'/);
  });
  it('비율표: 한 병과가 절반(올림)을 넘지 않고, 부대 6개까지는 형태별 범위를 지킨다 (그보다 많으면 절반 규칙이 우선)', () => {
    for (let n = 3; n <= 10; n++) {
      const cap = Math.ceil(n / 2);
      const s = targetMix('siege', n);
      const f = targetMix('field', n);
      const c = targetMix('castle', n);
      for (const m of [s, f, c]) {
        expect(m.infantry + m.cavalry + m.archer).toBe(n);
        for (const v of Object.values(m)) expect(v).toBeLessThanOrEqual(cap);
      }
      expect(c.archer).toBeGreaterThanOrEqual(c.infantry);
      expect(c.cavalry).toBeLessThanOrEqual(1);
      if (n > 6) continue;
      expect(s.archer).toBeGreaterThanOrEqual(1);
      expect(s.archer).toBeLessThanOrEqual(2);
      expect(s.cavalry).toBeLessThanOrEqual(1);
      expect(f.cavalry).toBeGreaterThanOrEqual(1);
      expect(f.cavalry).toBeLessThanOrEqual(2);
      expect(f.archer).toBe(1);
    }
  });
  it('농성(견고 수비)이면 수비는 궁병이 가장 많고, 출격(선제 출격)이면 기병이 들어간다', () => {
    const hold = count(activeUnits(start('def_hold'), 'def').filter((u) => u.autoKind && !u.skills.includes('cavalry') && !u.skills.includes('archery')).map((u) => u.kind));
    expect(hold.archer).toBeGreaterThanOrEqual(hold.infantry);
    const sally = start('def_sally');
    const free = activeUnits(sally, 'def').filter((u) => u.autoKind && !u.skills.includes('archery'));
    if (free.length >= 2) expect(free.some((u) => u.kind === 'cavalry')).toBe(true);
  });
  it('특기가 있으면 그 병과다', () => {
    const b = start('def_hold');
    for (const u of b.units.filter((x) => x.autoKind)) {
      if (u.skills.includes('cavalry')) expect(u.kind).toBe('cavalry');
      else if (u.skills.includes('archery')) expect(u.kind).toBe('archer');
    }
  });
});

describe('③ 병과 직접 고르기 (공격·수비 공용)', () => {
  it('직접 고른 병과는 자동 배정이 바꾸지 않는다', () => {
    const b0 = make(1);
    const id = b0.units.find((u) => u.side === 'atk')!.officer;
    const b = start('def_hold', { [id]: 'cavalry' });
    const u = b.units.find((x) => x.officer === id)!;
    expect(u.kind).toBe('cavalry');
    expect(u.autoKind).toBe(false);
  });
  it('적의 침공 창에 수비 부대 병종 고르기가 있고, 직접 지휘에 넘긴다 (기본 자동)', () => {
    const src = readFileSync('src/ui/screens/Strategy.tsx', 'utf-8');
    expect(src).toContain('<KindSelect');
    expect(src).toContain('commandIncoming(true, kinds)');
    expect(readFileSync('src/ui/store.ts', 'utf-8')).toContain("startBattle(g, setup, 'def', kinds)");
    expect(readFileSync('src/ui/components/Commands.tsx', 'utf-8')).toContain('<option value="">자동</option>');
  });
});

describe('④ 충차대', () => {
  it('성을 칠 때(수비 농성) 공격 측 자동 창병 하나가 충차대가 된다', () => {
    const b = start('def_hold');
    const rams = b.units.filter((u) => u.ram);
    expect(rams.length).toBe(1);
    expect(rams[0]!.side).toBe('atk');
    expect(rams[0]!.kind).toBe('infantry');
  });
  it('수비가 성 밖으로 나오면(야전) 충차대가 없다', () => {
    expect(start('def_sally').units.some((u) => u.ram)).toBe(false);
  });
  it('충차대는 성문 피해 3배·이동 느림·성벽 궁병에게 피해 +50%', () => {
    expect(RAM.gate).toBe(3);
    expect(RAM.speed).toBeLessThan(1);
    expect(RAM.hurtByWallArcher).toBe(1.5);
  });
  it('충차대는 성문을 노린다', () => {
    const b = start('def_hold');
    const ram = b.units.find((u) => u.ram)!;
    let sawGate = false;
    for (let i = 0; i < 300 && !b.result && !sawGate; i++) {
      tickPlanned(b, 1);
      if (ram.order.type === 'siege') sawGate = b.tiles[ram.order.y * b.w + ram.order.x]!.t === 'gate';
    }
    expect(sawGate).toBe(true);
  });
  it('3D: 충차는 충차대 부대에 붙는다', () => {
    const src = readFileSync('src/render3d/battle/siege.ts', 'utf-8');
    expect(src).toContain('u.ram');
  });
});
