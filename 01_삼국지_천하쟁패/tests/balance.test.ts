/** B1 폭주 방지 안전핀, B2 병종 상성, B3·B4 미리보기 */
import { loadGameData } from '../src/data/gameData';
import { KIND_MULT, createBattle, duelAcceptChance, previewDamage, stepBattle, applyTactic } from '../src/engine/battle/battle';
import { KIND_MATCHUP, type UnitKind } from '../src/engine/battle/types';
import { discordCooldown, prepareAttack, reward, sowDiscord } from '../src/engine/commands';
import { indexData, makeGame } from '../src/engine/ctx';
import { createGameState } from '../src/engine/state';

const data = loadGameData();
const ix = indexData(data);
const newGame = (f = 'cao') => makeGame(ix, createGameState(data, 's194', f, 9));

function battle() {
  const g = newGame();
  g.s.cities.chenliu!.food = 99999;
  const s = prepareAttack(g, 'cao', 'chenliu', 'puyang', ['cao_cao', 'xiahou_dun'], 8000);
  if (typeof s === 'string') throw new Error(s);
  return { g, b: createBattle(g, s, 'atk') };
}

describe('B1 안전핀', () => {
  it('혼란이 풀린 직후에는 다시 혼란에 걸리지 않는다', () => {
    const { b } = battle();
    const me = b.units.find((u) => u.side === 'atk')!;
    const foe = b.units.find((u) => u.side === 'def')!;
    me.x = foe.x - 2;
    me.y = foe.y;
    foe.confused = 1;
    stepBattle(b); // 혼란 해제 → 면역 시작
    expect(foe.confused).toBe(0);
    me.tacCd = 0;
    expect(applyTactic(b, me, 'confuse', foe.x, foe.y)).toContain('면역');
  });

  it('같은 해 같은 장수 포상은 효과가 줄어든다', () => {
    const g = newGame();
    const o = g.s.officers.xiahou_dun!;
    o.loyalty = 20;
    g.s.cities.chenliu!.gold = 9999;
    reward(g, 'cao', 'xiahou_dun', 100);
    const first = o.loyalty - 20;
    const mid = o.loyalty;
    reward(g, 'cao', 'xiahou_dun', 100);
    reward(g, 'cao', 'xiahou_dun', 100);
    const later = (o.loyalty - mid) / 2;
    expect(later).toBeLessThan(first);
  });

  it('같은 대상 이간은 3개월에 한 번만', () => {
    const g = newGame('cao');
    g.s.cities.chenliu!.gold = 9999;
    // 정욱·곽가는 둘 다 진류에 있다
    expect(sowDiscord(g, 'cheng_yu', 'chen_gong').ok).toBe(true);
    expect(discordCooldown(g, 'chen_gong')).toBe(3);
    expect(sowDiscord(g, 'guo_jia', 'chen_gong').ok).toBe(false);
  });
});

describe('B2 병종 상성 (37장)', () => {
  it('모든 병종에 강점 1개(×1.3)와 약점 1개(×0.8)가 있다', () => {
    for (const k of Object.keys(KIND_MATCHUP) as UnitKind[]) {
      const { strong, weak } = KIND_MATCHUP[k];
      expect(KIND_MULT[k][strong]).toBe(1.3);
      expect(KIND_MULT[k][weak]).toBe(0.8);
    }
  });
});

describe('B3·B4 미리보기', () => {
  it('예상 피해·반격과 일기토 수락 확률을 계산할 수 있다', () => {
    const { b } = battle();
    const me = b.units.find((u) => u.side === 'atk')!;
    const foe = b.units.find((u) => u.side === 'def')!;
    const p = previewDamage(b, me, foe);
    expect(p.dealt).toBeGreaterThan(0);
    expect(p.counter).toBeGreaterThan(0);
    const c = duelAcceptChance(b, me, foe);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(100);
  });
});

describe('QA-DEV-06 개막 정비 기간', () => {
  const step = async (g: ReturnType<typeof newGame>) => {
    const turn = await import('../src/engine/turn');
    const war = await import('../src/engine/war');
    const player = g.s.playerFaction;
    g.s.playerFaction = '__none__'; // 플레이어 세력도 AI로
    turn.runAiPhase(g);
    while (g.s.pendingBattles.length) war.resolveAttackAuto(g, g.s.pendingBattles.shift()!);
    g.s.playerFaction = player;
    turn.finishMonth(g);
    g.s.messages = [];
    g.s.proposals = [];
  };
  const owners = (g: ReturnType<typeof newGame>) => Object.fromEntries(Object.values(g.s.cities).map((c) => [c.id, c.faction]));
  const changed = (g: ReturnType<typeof newGame>, o: Record<string, string | null>) => Object.values(g.s.cities).filter((c) => c.faction !== o[c.id]).length;

  it('모든 시나리오에서 첫 달 도시 주인 변경이 평균 3개 이하다 (probe-sim D5-01)', async () => {
    let tot = 0;
    for (const sc of data.scenarios) {
      const g = makeGame(ix, createGameState(data, sc.id, sc.factions[0]!.id, 1));
      const o = owners(g);
      await step(g);
      tot += changed(g, o);
    }
    expect(tot / data.scenarios.length).toBeLessThanOrEqual(3);
  }, 60000);

  it('2·3번째 달에는 세력마다 한 곳만 공격한다', async () => {
    const { runAiFaction, monthsSinceStart } = await import('../src/engine/ai');
    const g = makeGame(ix, createGameState(data, 's194', 'liu_bei', 1));
    await step(g);
    expect(monthsSinceStart(g)).toBe(1);
    for (const f of Object.values(g.s.factions).filter((x) => x.alive)) expect(runAiFaction(g, f.id).length).toBeLessThanOrEqual(1);
  }, 60000);
});
