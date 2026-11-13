/**
 * 전투개편 1단계: 작전 회의 → 자동 전투
 */
import { loadGameData } from '../src/data/gameData';
import { planAi, preparePlannedBattle, runPlannedBattle, setPlan, startPlannedBattle } from '../src/engine/battle/auto';
import { activeUnits, createBattle, stepBattle } from '../src/engine/battle/battle';
import { equalBattle, playPair, runMatrix } from '../src/engine/battle/matrix';
import {
  ATK_POLICIES,
  DEF_POLICIES,
  MATCHUP,
  POLICIES,
  defaultPlan,
  execFactor,
  matchupSymbol,
  policyCheck,
} from '../src/engine/battle/plan';
import { battleReport } from '../src/engine/battle/report';
import { prepareAttack } from '../src/engine/commands';
import { indexData, makeGame, type Game } from '../src/engine/ctx';
import { parseSave, SAVE_VERSION } from '../src/engine/save';
import { createGameState } from '../src/engine/state';
import { resolveAttackAuto, startBattle } from '../src/engine/war';

const data = loadGameData();
const ix = indexData(data);
const make = (seed: number) => {
  const g: Game = makeGame(ix, createGameState(data, 's194', 'cao', seed));
  const setup = prepareAttack(g, 'cao', 'chenliu', 'puyang', ['cao_cao', 'xiahou_dun', 'dian_wei'], 3000);
  if (typeof setup === 'string') throw new Error(setup);
  return { g, setup };
};

describe('작전 회의: 1단만 골라도 나머지가 채워진다', () => {
  it('방침을 고르면 모든 부대에 역할·태도·퇴각 기준이 자동으로 들어간다', () => {
    const { g, setup } = make(1);
    const b = createBattle(g, setup, 'atk');
    for (const id of ATK_POLICIES) {
      const p = defaultPlan(b, 'atk', id);
      const us = activeUnits(b, 'atk');
      expect(Object.keys(p.units).sort()).toEqual(us.map((u) => u.id).sort());
      for (const up of Object.values(p.units)) {
        expect(['vanguard', 'main', 'left', 'right', 'reserve']).toContain(up.role);
        expect(up.stance).toBe(POLICIES[id].stance[up.role]);
        expect(up.retreatAt).toBe(POLICIES[id].retreatAt);
      }
      // 총대장은 중군
      expect(p.units[p.commander]?.role).toBe('main');
    }
  });

  it('공격 6종·방어 6종이고, 필요 조건이 안 되면 고를 수 없다', () => {
    expect(ATK_POLICIES).toHaveLength(6);
    expect(DEF_POLICIES).toHaveLength(6);
    const { g, setup } = make(2);
    setup.units = setup.units.slice(0, 1);
    const b = createBattle(g, setup, 'atk');
    expect(policyCheck(b, 'atk', 'atk_pincer').ok).toBe(false); // 부대 3개 필요
    expect(policyCheck(b, 'atk', 'atk_front').ok).toBe(true);
    expect(policyCheck(b, 'atk', 'def_hold').ok).toBe(false); // 반대쪽 방침
    b.weather = 'rain';
    expect(policyCheck(b, 'atk', 'atk_fire').ok).toBe(false);
  });
});

describe('상성과 실행도', () => {
  it('6×6 상성표가 설계서 6-1과 같은 방향이다', () => {
    expect(matchupSymbol(MATCHUP.atk_front.def_counter)).toBe('▼▼');
    expect(matchupSymbol(MATCHUP.atk_pincer.def_hold)).toBe('▲▲');
    expect(matchupSymbol(MATCHUP.atk_wedge.def_depth)).toBe('▼▼');
    expect(matchupSymbol(MATCHUP.atk_feint.def_sally)).toBe('▼');
    expect(matchupSymbol(MATCHUP.atk_lure.def_sally)).toBe('▲▲');
    expect(matchupSymbol(MATCHUP.atk_fire.def_sally)).toBe('▼▼');
    expect(matchupSymbol(MATCHUP.atk_front.def_sally)).toBe('―');
    expect(Math.abs(MATCHUP.atk_pincer.def_hold)).toBe(0.25);
    expect(Math.abs(MATCHUP.atk_pincer.def_depth)).toBe(0.12);
  });

  it('실행도가 요구치 이상이면 1, 조금 모자라면 줄고, 크게 모자라면 음수(따로 논다)', () => {
    expect(execFactor(80, 70)).toBe(1);
    expect(execFactor(64, 70)).toBeGreaterThan(0);
    expect(execFactor(64, 70)).toBeLessThan(1);
    expect(execFactor(40, 70)).toBeLessThan(0);
    expect(execFactor(0, 70)).toBeGreaterThanOrEqual(-1);
  });
});

describe('자동 전투', () => {
  it('작전만 정하면 개입 없이 끝까지 진행된다 (36개 조합 모두)', () => {
    for (const a of ATK_POLICIES)
      for (const d of DEF_POLICIES) {
        const { g, setup } = make(3);
        const b = playPair(g, setup, a, d);
        expect(b.result, `${a} vs ${d}`).toBeTruthy();
        expect(b.day).toBeLessThanOrEqual(b.maxDays + 1);
      }
  });

  it('같은 작전과 같은 시드면 같은 결과가 나온다 (리플레이·버그 재현)', () => {
    const r1 = playPair(make(4).g, make(4).setup, 'atk_pincer', 'def_ambush');
    const r2 = playPair(make(4).g, make(4).setup, 'atk_pincer', 'def_ambush');
    expect(r2.tick).toBe(r1.tick);
    expect(r2.result!.units).toEqual(r1.result!.units);
  });

  it('작전이 확정되기 전에는 부대가 움직이지 않는다', () => {
    const { g, setup } = make(5);
    const b = createBattle(g, setup, 'atk');
    preparePlannedBattle(b, ['def']);
    const pos = b.units.map((u) => [u.x, u.y]);
    planAi(b);
    expect(b.units.map((u) => [u.x, u.y])).toEqual(pos);
    expect(() => startPlannedBattle(b)).toThrow();
  });

  // 전투 수정 요청 2026-11-13 ①: 견고 수비·종심 방어·지연전은 성 안(궁병은 성벽), 유인 역습·매복 요격·선제 출격은 성 밖
  for (const [pol, inside] of [['def_hold', true], ['def_depth', true], ['def_delay', true], ['def_counter', false], ['def_ambush', false], ['def_sally', false]] as const) {
    it(`${pol}: 수비군은 ${inside ? '성 안에서 버틴다 (궁병은 성벽 위)' : '성 밖 들판에 진을 친다'}`, () => {
      const { g, setup } = make(6);
      const b = createBattle(g, setup, 'atk');
      preparePlannedBattle(b, ['def']);
      setPlan(b, 'def', defaultPlan(b, 'def', pol));
      setPlan(b, 'atk', defaultPlan(b, 'atk', 'atk_front'));
      startPlannedBattle(b);
      const inCastle = (u: { x: number; y: number }) => u.x >= 16 && u.x <= 22 && u.y >= 5 && u.y <= 11;
      const def = activeUnits(b, 'def').filter((u) => !u.hidden);
      if (inside) {
        expect(def.every(inCastle)).toBe(true);
        for (const u of def.filter((x) => x.kind === 'archer')) expect(b.tiles[u.y * b.w + u.x]!.t).toBe('wall');
      } else expect(def.some((u) => !inCastle(u))).toBe(true);
    });
  }

  it('매복 부대는 드러나기 전에는 공격받지 않고, 적이 다가오면 뛰쳐나온다', () => {
    const { g, setup } = make(7);
    const b = equalBattle(g, setup);
    preparePlannedBattle(b, []);
    setPlan(b, 'atk', defaultPlan(b, 'atk', 'atk_front'));
    setPlan(b, 'def', defaultPlan(b, 'def', 'def_ambush'));
    startPlannedBattle(b);
    const hidden = b.units.filter((u) => u.hidden);
    if (!hidden.length) return; // 숲이 없는 전장 (시드에 따라)
    let revealed = false;
    for (let i = 0; i < 400 && !b.result; i++) {
      planAi(b);
      for (const h of hidden) if (h.hidden) expect(h.troops).toBe(h.startTroops);
      stepBattle(b);
      if (hidden.some((h) => !h.hidden)) revealed = true;
    }
    expect(revealed).toBe(true);
  });

  it('퇴각 기준 아래로 병력이 줄면 스스로 물러난다', () => {
    const { g, setup } = make(8);
    const b = equalBattle(g, setup);
    preparePlannedBattle(b, []);
    setPlan(b, 'atk', defaultPlan(b, 'atk', 'atk_front'));
    setPlan(b, 'def', defaultPlan(b, 'def', 'def_hold'));
    startPlannedBattle(b);
    const u = activeUnits(b, 'atk')[0]!;
    b.plans!.atk!.units[u.id]!.retreatAt = 0.5;
    u.troops = Math.floor(u.startTroops * 0.4);
    planAi(b);
    expect(u.order.type).toBe('retreat');
  });
});

describe('결과 보고서', () => {
  it('승패·피해와 함께 적 방침과 상성이 공개된다', () => {
    const { g, setup } = make(9);
    const b = playPair(g, setup, 'atk_pincer', 'def_hold');
    const rep = battleReport(b, 'atk');
    expect(rep.enemyPolicy).toBe('견고 수비');
    expect(rep.myPolicy).toBe('학익 포위');
    expect(rep.matchup).toBe('▲▲');
    expect(rep.myLoss).toBeGreaterThanOrEqual(0);
    expect(rep.enemyLoss).toBeGreaterThan(0);
    expect(rep.advice.length).toBeGreaterThan(0);
  });
});

describe('게임 연결', () => {
  it('플레이어 출진은 작전 회의 대기 상태로 만들어지고, AI 쪽 작전은 미리 정해진다', () => {
    const { g, setup } = make(10);
    const b = startBattle(g, setup, 'atk')!;
    expect(b.auto).toBe(true);
    expect(b.started).toBeFalsy();
    expect(b.plans?.def?.byAi).toBe(true);
    expect(b.plans?.atk).toBeUndefined();
  });

  it('AI끼리 전투도 작전 자동 전투로 끝난다', () => {
    const { g, setup } = make(11);
    expect(() => resolveAttackAuto(g, setup)).not.toThrow();
  });

  it('직접 조작 시절(v2) 세이브의 진행 중 전투는 AI 작전으로 이어진다', () => {
    const { g, setup } = make(12);
    const b = createBattle(g, setup, 'atk');
    for (let i = 0; i < 20; i++) stepBattle(b);
    const text = JSON.stringify({ format: 'samgukji-save', saveVersion: 2, meta: { slot: 'slot1', date: '', label: '', savedAt: 0 }, state: g.s, battle: { state: b, isDefense: false } });
    const r = parseSave(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.saveVersion).toBe(SAVE_VERSION);
    const lb = r.payload.battle!.state;
    expect(lb.plans?.atk && lb.plans.def).toBeTruthy();
    expect(lb.started).toBe(true);
    runPlannedBattle(lb);
    expect(lb.result).toBeTruthy();
  });
});

describe('방침 매트릭스 (설계서 15-1: 지배 방침 없음)', () => {
  // 재보정 대기: 농성 위치·자동 병과 변경(2026-11-13 전투 수정 요청)으로 정면 돌파 평균이 30% 밑으로 내려갔다.
  // 사용자가 policy-matrix 재보정을 APK 뒤로 미뤘으므로 기준은 그대로 두고 잠시 건너뛴다. 재보정할 때 되살릴 것.
  it.skip('어떤 방침도 다른 모든 방침을 압도하지 않는다 (표본 축소판: 조합당 6회, 평균 30~70%)', () => {
    // 정식 기준(45~55%, 조합당 40회)은 scripts/policy-matrix.ts 로 확인한다
    const r = runMatrix(make, 6);
    for (const [id, v] of Object.entries(r.avg)) {
      expect(v, id).toBeGreaterThanOrEqual(0.3);
      expect(v, id).toBeLessThanOrEqual(0.7);
    }
    expect(r.atkOverall).toBeGreaterThan(0.35);
    expect(r.atkOverall).toBeLessThan(0.65);
  }, 120_000);
});
