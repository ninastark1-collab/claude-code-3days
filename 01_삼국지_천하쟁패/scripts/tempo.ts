/**
 * B8: 설계노트 42장 플레이 템포 측정 (기계로 잴 수 있는 항목만)
 * 사용법: npm run tempo
 */
import { loadGameData } from '../src/data/gameData';
import { autoResolve } from '../src/engine/battle/ai';
import { createBattle, stepBattle } from '../src/engine/battle/battle';
import { TICKS_PER_DAY } from '../src/engine/battle/types';
import { indexData, makeGame, type Game } from '../src/engine/ctx';
import { parseSave } from '../src/engine/save';
import { createGameState } from '../src/engine/state';
import { finishMonth, runAiPhase } from '../src/engine/turn';
import { applyBattleResult, isUndefended, resolveAttackAuto } from '../src/engine/war';
import { prepareAttack } from '../src/engine/commands';
import { neighborsOf, officersIn } from '../src/engine/world';

const data = loadGameData();
const ix = indexData(data);
const NORMAL_TPS = 3; // 전투 "보통" 속도: 초당 3틱
const DUEL_ROUND_MS = 160;

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const avg = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  return { avg, p50: s[Math.floor(s.length / 2)] ?? 0, max: s.at(-1) ?? 0, n: s.length };
};
const f1 = (n: number) => n.toFixed(1);

function month(g: Game, battleDays: number[], autoMs: number[]): number {
  const t0 = performance.now();
  const p = g.s.playerFaction;
  g.s.playerFaction = '__none__';
  // AI 공격 중 실제 전투가 벌어지는 것만 따로 재기 위해 직접 처리
  runAiPhase(g);
  g.s.playerFaction = p;
  const aiMs = performance.now() - t0;
  while (g.s.pendingBattles.length) {
    const s = g.s.pendingBattles.shift()!;
    if (isUndefended(g, s.city)) {
      resolveAttackAuto(g, s);
      continue;
    }
    const tb = performance.now();
    const b = createBattle(g, s, null);
    autoResolve(b, stepBattle);
    autoMs.push(performance.now() - tb);
    battleDays.push(b.day);
    applyBattleResult(g, b);
  }
  finishMonth(g);
  g.s.messages = [];
  g.s.proposals = [];
  return aiMs;
}

/** 인접한 적 도시 공격을 최대 8건 골라 복사본에서 자동 전투로 끝까지 돌려 본다 */
function sampleBattles(g: Game, days: number[], autoMs: number[]): void {
  let n = 0;
  for (const c of Object.values(g.s.cities)) {
    if (!c.faction || n >= 8) continue;
    const army = officersIn(g, c.id, c.faction)
      .filter((o) => o.troops >= 1000)
      .sort((a, b) => b.troops - a.troops)
      .slice(0, 5);
    if (!army.length) continue;
    const target = neighborsOf(g, c.id).find((x) => {
      const t = g.s.cities[x.to]!;
      return t.faction && t.faction !== c.faction && !isUndefended(g, x.to);
    });
    if (!target) continue;
    const copy = makeGame(ix, JSON.parse(JSON.stringify(g.s)));
    copy.s.cities[c.id]!.food = 999999;
    const s = prepareAttack(copy, c.faction, c.id, target.to, army.map((o) => o.id), Math.ceil(army.reduce((a, o) => a + o.troops, 0) / 100) * 30);
    if (typeof s === 'string') continue;
    const tb = performance.now();
    const b = createBattle(copy, s, null);
    autoResolve(b, stepBattle);
    autoMs.push(performance.now() - tb);
    days.push(b.day);
    n++;
  }
}

console.log('== 42장 템포 측정 ==\n');
for (const id of ['s194', 's190', 's208']) {
  const sc = data.scenarios.find((s) => s.id === id)!;
  // 플레이어 세력의 방어전도 전투로 잡히도록 가장 작은 세력을 플레이어로 둔다
  const g = makeGame(ix, createGameState(data, id, sc.factions.at(-1)!.id, 1));
  const ai: number[] = [];
  const days: number[] = [];
  const autoMs: number[] = [];
  for (let m = 0; m < 120 && !g.s.ending; m++) {
    ai.push(month(g, days, autoMs));
    // AI끼리의 전투는 AI 턴 안에서 끝나므로, 1년마다 실제 공방전을 표본으로 따로 재 본다 (상태 복사본에서)
    if (m % 12 === 0) sampleBattles(g, days, autoMs);
  }
  const a = stats(ai);
  const d = stats(days);
  const au = stats(autoMs);
  // 세이브·로드: 10년 진행 후 상태 크기와 직렬화·파싱 시간
  const t0 = performance.now();
  const text = JSON.stringify({ format: 'samgukji-save', saveVersion: 2, meta: {}, state: g.s });
  const t1 = performance.now();
  parseSave(text);
  const t2 = performance.now();
  console.log(`[${id} ${sc.name}] 10년(120턴) 진행`);
  console.log(`  AI 턴 대기(전 세력 합)  평균 ${f1(a.avg)}ms · 중앙 ${f1(a.p50)}ms · 최대 ${f1(a.max)}ms   (목표 5초 이내)`);
  console.log(`  자동 전투 계산           평균 ${f1(au.avg)}ms · 최대 ${f1(au.max)}ms · ${au.n}회   (목표 10초)`);
  console.log(`  전투 길이(게임 내 일수)  평균 ${f1(d.avg)}일 · 중앙 ${d.p50}일 · 최대 ${d.max}일`);
  console.log(
    `  → 직접 지휘 시 실제 시간(보통 속도, 일시정지 제외) 평균 ${f1((d.avg * TICKS_PER_DAY) / NORMAL_TPS / 60)}분 · 최대 ${f1((d.max * TICKS_PER_DAY) / NORMAL_TPS / 60)}분   (목표 5~10분)`,
  );
  console.log(`  세이브 크기 ${f1(text.length / 1024)}KB · 저장 ${f1(t1 - t0)}ms · 불러오기 ${f1(t2 - t1)}ms   (목표 3초 이내)\n`);
}
console.log(`일기토 연출: 최대 40합 × ${DUEL_ROUND_MS}ms = 최대 ${(40 * DUEL_ROUND_MS) / 1000}초 (건너뛰기 가능)   (목표 1~2분)`);
console.log('첫 전투까지·1개월 턴 길이·통일까지 시간은 사람이 직접 플레이해야 잴 수 있음');
