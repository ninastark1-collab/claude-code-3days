/**
 * 방침 매트릭스 시험 (전투개편 설계서 15-2)
 *   npx tsx scripts/policy-matrix.ts [조합당 횟수=40] [공격 병력 배율=1]
 * 목표: 방침별 평균 승률 45~55% (지배 방침 없음)
 */
import { loadGameData } from '../src/data/gameData';
import { prepareAttack } from '../src/engine/commands';
import { indexData, makeGame } from '../src/engine/ctx';
import { runMatrix } from '../src/engine/battle/matrix';
import { POLICIES } from '../src/engine/battle/plan';
import { createGameState } from '../src/engine/state';
import type { AtkPolicy, DefPolicy } from '../src/engine/battle/types';

const n = Number(process.argv[2] ?? 40);
const k = Number(process.argv[3] ?? 1);
/** 세 번째 인자 = 자동 보정 반복 횟수 (방침별 power를 승률 차이만큼 조금씩 움직인다) */
const tune = Number(process.argv[4] ?? 0);
const data = loadGameData();
const ix = indexData(data);
const t0 = Date.now();
const make = (seed: number) => {
  const g = makeGame(ix, createGameState(data, 's194', 'cao', seed));
  const setup = prepareAttack(g, 'cao', 'chenliu', 'puyang', ['cao_cao'], 3000);
  if (typeof setup === 'string') throw new Error(setup);
  return { g, setup };
};
for (let it = 0; it < tune; it++) {
  const t = runMatrix(make, n, { atkMult: k });
  for (const [id, v] of Object.entries(t.avg)) {
    const p = POLICIES[id as AtkPolicy];
    p.power = Math.round(((p.power ?? 0) - (v - 0.5) * Number(process.env.RATE ?? 0.12)) * 1000) / 1000;
  }
  console.log(`보정 ${it + 1}: 공격 전체 ${Math.round(t.atkOverall * 100)}%`, Object.entries(t.avg).map(([id, v]) => `${POLICIES[id as AtkPolicy].code}:${Math.round(v * 100)}`).join(' '));
}
if (tune) console.log('power =', JSON.stringify(Object.fromEntries(Object.values(POLICIES).map((p) => [p.id, p.power ?? 0]))));
const r = runMatrix(
  (seed) => {
    const g = makeGame(ix, createGameState(data, 's194', 'cao', seed));
    const setup = prepareAttack(g, 'cao', 'chenliu', 'puyang', ['cao_cao'], 3000);
    if (typeof setup === 'string') throw new Error(setup);
    return { g, setup };
  },
  n,
  { atkMult: k },
);
const pct = (v: number) => `${Math.round(v * 100)}`.padStart(3);
const nm = (id: string) => POLICIES[id as AtkPolicy].name;
const defs = Object.keys(r.table.atk_front) as DefPolicy[];
console.log(`조합당 ${n}회, 공격 병력 ×${k}, 평균 ${Math.round(r.avgTicks)}틱 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
console.log(`공격 \\ 방어 | ${defs.map(nm).join(' | ')} | 평균`);
for (const a of Object.keys(r.table) as AtkPolicy[]) console.log(`${nm(a)} | ${defs.map((d) => pct(r.table[a][d])).join(' | ')} | ${pct(r.avg[a]!)}`);
console.log(`방어 평균 | ${defs.map((d) => pct(r.avg[d]!)).join(' | ')} |`);
console.log(`공격 전체 승률 ${pct(r.atkOverall)}%`);
const bad = Object.entries(r.avg).filter(([, v]) => v < 0.45 || v > 0.55);
console.log(bad.length ? `기준 밖: ${bad.map(([id, v]) => `${nm(id)} ${pct(v)}%`).join(', ')}` : '모든 방침이 45~55% 안');
