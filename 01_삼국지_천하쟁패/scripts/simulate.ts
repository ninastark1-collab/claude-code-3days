/**
 * 헤드리스 AI 밸런스 시뮬레이션.
 * 사용법: npm run simulate -- [시나리오] [년수] [시드 수]
 */
import { loadGameData } from '../src/data/gameData';
import { indexData, makeGame } from '../src/engine/ctx';
import { createGameState } from '../src/engine/state';
import { finishMonth, runAiPhase } from '../src/engine/turn';
import { resolveAttackAuto } from '../src/engine/war';
import { citiesOf } from '../src/engine/world';

const [scenario = 's194', yearsArg = '30', seedsArg = '5'] = process.argv.slice(2);
const data = loadGameData();
const ix = indexData(data);
const sc = data.scenarios.find((s) => s.id === scenario);
if (!sc) throw new Error(`시나리오 없음: ${scenario}`);

const winners: Record<string, number> = {};
for (let seed = 1; seed <= Number(seedsArg); seed++) {
  // 관전용: 가장 작은 세력을 "플레이어"로 두되 AI처럼 방어만 자동 처리
  const g = makeGame(ix, createGameState(data, scenario, sc.factions[0]!.id, seed));
  const t0 = Date.now();
  let battles = 0;
  const checkpoints: string[] = [];
  for (let m = 0; m < Number(yearsArg) * 12 && !g.s.ending; m++) {
    // 플레이어 세력도 AI가 대신 움직이도록 잠시 바꿔치기
    const player = g.s.playerFaction;
    g.s.playerFaction = '__none__';
    const logLen = g.s.log.length;
    runAiPhase(g);
    while (g.s.pendingBattles.length) resolveAttackAuto(g, g.s.pendingBattles.shift()!);
    g.s.playerFaction = player;
    finishMonth(g);
    battles += g.s.log.slice(logLen).filter((l) => l.text.includes('점령') || l.text.includes('방어 성공')).length;
    g.s.messages = [];
    g.s.proposals = [];
    if (g.s.month === 1 && g.s.year % 5 === 0) {
      const alive = Object.values(g.s.factions).filter((f) => f.alive);
      checkpoints.push(
        `${g.s.year}: ` +
          alive
            .map((f) => [f.name, citiesOf(g, f.id).length] as const)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([n, c]) => `${n}${c}`)
            .join(' '),
      );
    }
  }
  const alive = Object.values(g.s.factions).filter((f) => f.alive);
  const top = alive.map((f) => [f.name, citiesOf(g, f.id).length] as const).sort((a, b) => b[1] - a[1])[0];
  if (top) winners[top[0]] = (winners[top[0]] ?? 0) + 1;
  console.log(`seed ${seed}: ${g.s.year}년, 생존 ${alive.length}세력, 전투 ${battles}회, ${Date.now() - t0}ms`);
  for (const c of checkpoints) console.log('   ' + c);
}
console.log('최대 세력 분포:', winners);
