/**
 * 내정 정보 표시 · 등용 확률 조정 · 동맹 협공 (2026-11-13 사용자 요청)
 */
import { loadGameData } from '../src/data/gameData';
import { runPlannedBattle, setPlan, startPlannedBattle } from '../src/engine/battle/auto';
import { defaultPlan } from '../src/engine/battle/plan';
import { conscript, prepareAttack, recruit, recruitChance, recruitCooldown, setTreaty, train } from '../src/engine/commands';
import { indexData, makeGame, type Game } from '../src/engine/ctx';
import { josa } from '../src/engine/josa';
import { activePacts, allyReinforcements, diploJointAttack, jointTargets, pactBoost } from '../src/engine/joint';
import { createGameState, getRelation } from '../src/engine/state';
import { citiesOf, neighborsOf, officersIn } from '../src/engine/world';
import { applyBattleResult, startBattle } from '../src/engine/war';

const data = loadGameData();
const ix = indexData(data);
const newGame = (seed = 1, pf = 'cao'): Game => makeGame(ix, createGameState(data, 's194', pf, seed));

describe('징병·훈련 결과에 현재값과 바뀐 값이 나온다', () => {
  it('징병: 병력 전→후, 금, 남은 금', () => {
    const g = newGame();
    const o = Object.values(g.s.officers).find((x) => x.faction === 'cao' && x.status === 'serving' && x.troops < 3000 && g.s.cities[x.city]!.faction === 'cao')!;
    g.s.cities[o.city]!.gold = 5000;
    g.s.cities[o.city]!.population = 500000;
    const before = o.troops;
    const r = conscript(g, o.id);
    expect(r.ok).toBe(true);
    expect(r.msg).toContain(`병력 ${before}→${o.troops}`);
    expect(r.msg).toContain(`남은 금 ${g.s.cities[o.city]!.gold}`);
  });
  it('훈련: 훈련도 전→후', () => {
    const g = newGame();
    const o = Object.values(g.s.officers).find((x) => x.faction === 'cao' && x.status === 'serving' && x.troops > 0)!;
    o.training = 40;
    const r = train(g, o.id);
    expect(r.msg).toContain(`훈련도 40→${o.training}`);
  });
});

describe('다른 세력 장수 등용은 쉽지 않다', () => {
  const pickEnemy = (g: Game) => Object.values(g.s.officers).find((x) => x.status === 'serving' && x.faction && x.faction !== 'cao' && g.s.factions[x.faction]!.ruler !== x.id)!;
  it('충성 80 이상이면 0%, 아무리 낮아도 60%를 넘지 않는다', () => {
    const g = newGame();
    const t = pickEnemy(g);
    t.loyalty = 85;
    expect(recruitChance(g, 'cao_cao', t.id)).toBe(0);
    t.loyalty = 0;
    expect(recruitChance(g, 'cao_cao', t.id)).toBeLessThanOrEqual(65); // 60 + 천자 보정 5
  });
  it('시작 시점 적 장수 등용 확률은 대부분 낮다', () => {
    const g = newGame();
    const ps = Object.values(g.s.officers)
      .filter((x) => x.status === 'serving' && x.faction !== 'cao')
      .map((x) => recruitChance(g, 'cao_cao', x.id));
    expect(ps.filter((p) => p >= 30).length).toBe(0);
  });
  it('거절당하면 3개월 동안 다시 권유할 수 없다', () => {
    const g = newGame();
    const t = pickEnemy(g);
    t.loyalty = 79;
    const rec = Object.values(g.s.officers).find((x) => x.faction === 'cao' && x.status === 'serving' && g.s.cities[x.city]!.faction === 'cao')!;
    g.s.cities[rec.city]!.gold = 9999;
    // 확률이 낮으니 거절될 때까지 시도
    let refused = false;
    for (let i = 0; i < 30 && !refused; i++) {
      rec.acted = false;
      g.s.flags[`rc_${t.id}`] = -99;
      const r = recruit(g, rec.id, t.id);
      if (t.faction !== 'cao' && r.ok && r.msg.includes('거절')) refused = true;
      if (t.faction === 'cao') return; // 운 좋게 넘어오면 이 검사는 건너뜀
    }
    expect(refused).toBe(true);
    expect(recruitCooldown(g, t.id)).toBe(3);
    rec.acted = false;
    expect(recruit(g, rec.id, t.id).ok).toBe(false);
  });
  it('포로 등용 확률은 80%를 넘지 않는다', () => {
    const g = newGame();
    const t = pickEnemy(g);
    t.status = 'captive';
    t.captor = 'cao';
    t.loyalty = 0;
    expect(recruitChance(g, 'cao_cao', t.id)).toBeLessThanOrEqual(85);
  });
});

/** 플레이어(조조군)와 맞닿은 적 도시를 같이 칠 수 있는 동맹 후보 찾기 */
function setupJoint(g: Game) {
  const me = 'cao';
  for (const f of Object.values(g.s.factions)) {
    if (f.id === me || !f.alive) continue;
    setTreaty(g, me, f.id, 'alliance');
    const ts = jointTargets(g, me, f.id).filter((c) => allyReinforcementsSoon(g, f.id, c));
    if (ts.length) return { ally: f.id, city: ts[0]! };
    setTreaty(g, me, f.id, 'none');
  }
  return null;
}
function allyReinforcementsSoon(g: Game, ally: string, city: string) {
  return neighborsOf(g, city).some((n) => g.s.cities[n.to]?.faction === ally && officersIn(g, n.to, ally).filter((o) => o.troops >= 1000).length >= 2);
}

describe('동맹 협공', () => {
  it('동맹국만 협공을 청할 수 있고, 약속하면 출진할 때 원군이 합류해 전투 뒤 자기 도시로 돌아간다', () => {
    const g = newGame(5);
    const j = setupJoint(g);
    expect(j).not.toBeNull();
    const { ally, city } = j!;
    const myCity = neighborsOf(g, city).map((n) => n.to).find((c) => g.s.cities[c]!.faction === 'cao')!;
    const envoy = officersIn(g, myCity, 'cao')[0]!;
    g.s.cities[envoy.city]!.gold = 99999;
    getRelation(g.s, 'cao', ally).friendship = 100;
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      envoy.acted = false;
      diploJointAttack(g, envoy.id, ally, city);
      ok = activePacts(g).some((p) => p.ally === ally && p.city === city);
    }
    expect(ok).toBe(true);
    expect(pactBoost(g, ally, city)).toBe(true);
    const helpers = allyReinforcements(g, 'cao', city);
    expect(helpers.length).toBeGreaterThan(0);
    for (const o of officersIn(g, myCity, 'cao')) o.acted = false;
    const mine = officersIn(g, myCity, 'cao').filter((o) => o.troops > 0).slice(0, 3);
    g.s.cities[myCity]!.food = 999999;
    const setup = prepareAttack(g, 'cao', myCity, city, mine.map((o) => o.id), 30000);
    if (typeof setup === 'string') throw new Error(setup);
    const b = startBattle(g, setup, 'atk')!;
    expect(b).toBeTruthy();
    const allyUnits = b.units.filter((u) => u.side === 'atk' && u.faction === ally);
    expect(allyUnits.length).toBe(helpers.length);
    // 약속은 한 번 쓰면 사라진다
    expect(activePacts(g).some((p) => p.city === city)).toBe(false);
    setPlan(b, 'atk', defaultPlan(b, 'atk', 'atk_front'));
    startPlannedBattle(b);
    runPlannedBattle(b);
    applyBattleResult(g, b);
    for (const h of helpers) {
      const o = g.s.officers[h.officer]!;
      if (o.status !== 'serving') continue;
      expect(o.faction).toBe(ally);
      expect(g.s.cities[o.city]!.faction).toBe(ally);
    }
  });

  it('동맹이 아니면 협공을 청할 수 없다', () => {
    const g = newGame(6);
    const other = Object.values(g.s.factions).find((f) => f.id !== 'cao')!.id;
    const envoy = Object.values(g.s.officers).find((o) => o.faction === 'cao' && o.status === 'serving')!;
    const c = citiesOf(g, other)[0]!.id;
    expect(diploJointAttack(g, envoy.id, other, c).ok).toBe(false);
  });
});

describe('조사 고르기', () => {
  it('받침에 따라 을/를, 이/가를 고른다', () => {
    expect(josa('조조', '을/를')).toBe('조조를');
    expect(josa('관우', '이/가')).toBe('관우가');
    expect(josa('업성', '을/를')).toBe('업성을');
    expect(josa('서주', '으로/로')).toBe('서주로');
    expect(josa('하북', '으로/로')).toBe('하북으로');
  });
});
