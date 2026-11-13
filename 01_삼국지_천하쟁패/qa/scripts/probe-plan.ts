/**
 * 작전 자동 전투 프로브 (전투개편 설계서 기준, 테스터 독립 검증).
 * 개발 쪽 단위 테스트(tests/battle-plan.test.ts)와 별개로, 돈 내고 산 게이머가 느낄 문제를 본다.
 *   - 지배 방침/쓸모없는 방침이 없는가 (정답 없는 상성)
 *   - 화면에 보여 주는 상성 기호(MATCHUP)가 실제 결과와 맞는가 (거짓 정보 = 신뢰 붕괴)
 *   - 위임(군사에게 맡기기)이 아무 방침보다 나은가
 *   - 실제 시나리오 전투가 끝나는가, 보고서 문장이 멀쩡한가, 약자 역전이 상식선인가
 *   - 결정론, 작전 확정 후 저장 복원, 실행도 단조성, "결과만 보기" 속도 (폰 환산)
 * 사용법: npx tsx qa/scripts/probe-plan.ts [조합당 횟수=8]
 */
import { Report, newGame, pct, timer } from './lib';
import type { Game } from '../../src/engine/ctx';
import type { BattleSetup } from '../../src/engine/state';

const N = Number(process.argv[2] ?? 8);
const r = new Report('probe-plan');
const B = await import('../../src/engine/battle/battle');
const A = await import('../../src/engine/battle/auto');
const P = await import('../../src/engine/battle/plan');
const M = await import('../../src/engine/battle/matrix');
const R = await import('../../src/engine/battle/report');
const C = await import('../../src/engine/commands');
const world = await import('../../src/engine/world');
type BattleState = import('../../src/engine/battle/types').BattleState;
type AtkPolicy = import('../../src/engine/battle/types').AtkPolicy;
type DefPolicy = import('../../src/engine/battle/types').DefPolicy;

const PHONE_SLOWDOWN = 6; // 보급형 폰 JS ≈ 데스크톱 node의 1/6로 가정

const make = (seed: number) => {
  const g = newGame('s194', 'cao', seed);
  const setup = C.prepareAttack(g, 'cao', 'chenliu', 'puyang', ['cao_cao'], 3000);
  if (typeof setup === 'string') throw new Error(`setup 실패: ${setup}`);
  return { g, setup };
};

function setups(g: Game): BattleSetup[] {
  const out: BattleSetup[] = [];
  for (const c of Object.values(g.s.cities)) {
    if (!c.faction) continue;
    const attackers = world.officersIn(g, c.id, c.faction).filter((o) => o.troops > 0).slice(0, 5);
    if (!attackers.length) continue;
    for (const n of world.neighborsOf(g, c.id)) {
      const t = g.s.cities[n.to]!;
      if (!t.faction || t.faction === c.faction) continue;
      if (!world.officersIn(g, t.id, t.faction).some((o) => o.troops > 0)) continue;
      const troops = attackers.reduce((s, o) => s + o.troops, 0);
      out.push({ id: `qa_${c.id}_${t.id}`, attacker: c.faction, defender: t.faction, from: c.id, city: t.id, units: attackers.map((o) => ({ officer: o.id, troops: o.troops })), food: Math.ceil(troops / 10) * 3 });
    }
  }
  return out;
}

const BAD_TEXT = /undefined|NaN|null|\[object|이\(가\)|을\(를\)|은\(는\)|\(으\)로|와\(과\)/;

// ───────── 1. 같은 전력 매트릭스: 지배·무용 방침, 공수 균형 ─────────
let matrix: ReturnType<typeof M.runMatrix> | null = null;
await r.check('BP-01 방침 매트릭스', () => {
  const t = timer();
  matrix = M.runMatrix(make, N);
  r.info('BP-01', `조합당 ${N}회, 36조합, ${(t() / 1000).toFixed(1)}s, 평균 ${Math.round(matrix.avgTicks)}틱, 공격 전체 승률 ${pct(matrix.atkOverall, 1)}%`);
  const dom = Object.entries(matrix.avg).filter(([, v]) => v > 0.62);
  const dead = Object.entries(matrix.avg).filter(([, v]) => v < 0.38);
  const nm = (id: string) => P.POLICIES[id as AtkPolicy].name;
  const lst = (xs: [string, number][]) => xs.map(([id, v]) => `${nm(id)} ${pct(v, 1)}%`).join(', ');
  if (dom.length) r.fail('BP-01a', 'S2', '개발', `지배 방침(평균 승률 62% 초과): ${lst(dom)} — 게이머는 이것만 쓴다`);
  else r.pass('BP-01a', '지배 방침 없음 (모두 62% 이하)');
  if (dead.length) r.warn('BP-01b', '개발', `쓸모없는 방침(평균 38% 미만): ${lst(dead)}`);
  else r.pass('BP-01b', '쓸모없는 방침 없음 (모두 38% 이상)');
  if (matrix.atkOverall < 0.3 || matrix.atkOverall > 0.7) r.warn('BP-01c', '개발', `같은 전력 공격 승률 ${pct(matrix.atkOverall, 1)}% — 30~70% 밖 (공성 이점/불리가 과함)`);
  else r.pass('BP-01c', `같은 전력 공격 승률 ${pct(matrix.atkOverall, 1)}%`);
  // 모든 공격 방침에 천적(공격 승률 35% 미만인 방어)이 있어야 "정답 없는 상성"
  const noCounter = P.ATK_POLICIES.filter((a) => !P.DEF_POLICIES.some((d) => matrix!.table[a][d] < 0.35));
  if (noCounter.length) r.warn('BP-01d', '개발', `막을 방어 방침이 없는 공격 방침: ${noCounter.map(nm).join(', ')}`);
  else r.pass('BP-01d', '모든 공격 방침에 천적 방어가 있음');
  const rows = P.ATK_POLICIES.map((a) => `${nm(a).padEnd(6)} ${P.DEF_POLICIES.map((d) => String(Math.round(matrix!.table[a][d] * 100)).padStart(4)).join('')}`);
  r.info('BP-01e', '승률표(공격 기준 %)', [`        ${P.DEF_POLICIES.map((d) => nm(d).slice(0, 3).padStart(4)).join('')}`, ...rows].join('\n'));
});

// ───────── 2. 화면 상성 기호가 실제와 맞는가 ─────────
await r.check('BP-02 상성 표기 신뢰도', () => {
  if (!matrix) throw new Error('SKIP: 매트릭스 없음');
  let agree = 0, total = 0;
  const lies: string[] = [];
  for (const a of P.ATK_POLICIES) {
    const rowAvg = P.DEF_POLICIES.reduce((s, d) => s + matrix!.table[a][d], 0) / P.DEF_POLICIES.length;
    for (const d of P.DEF_POLICIES) {
      const declared = P.MATCHUP[a][d];
      if (!declared) continue;
      total++;
      const measured = matrix.table[a][d] - rowAvg;
      if (Math.sign(measured) === Math.sign(declared) || Math.abs(measured) < 0.05) agree++;
      else lies.push(`${P.POLICIES[a].name}→${P.POLICIES[d].name}: 표기 ${P.matchupSymbol(declared)} / 실제 ${measured > 0 ? '+' : ''}${Math.round(measured * 100)}%p`);
    }
  }
  const rate = total ? agree / total : 1;
  if (rate < 0.7) r.fail('BP-02', 'S2', '개발', `작전 회의의 상성 표기가 실제와 반대인 조합 ${lies.length}/${total} — 게이머가 보고 고른 작전이 오히려 진다`, lies.join('\n'));
  else if (lies.length) r.warn('BP-02', '개발', `상성 표기와 실제가 어긋나는 조합 ${lies.length}/${total}`, lies.join('\n'));
  else r.pass('BP-02', `상성 표기와 실제 결과 일치 (${total}조합)`);
});

// ───────── 3. 위임(군사에게 맡기기)이 의미 있는가 ─────────
await r.check('BP-03 위임 작전 가치', () => {
  let delegWin = 0, randWin = 0;
  const n = N * 6;
  for (let i = 0; i < n; i++) {
    const seed = 50_000 + i;
    // 위임: 양쪽 AI 작전
    { const { g, setup } = make(seed); const b = M.equalBattle(g, setup); A.preparePlannedBattle(b, ['atk', 'def']); A.runPlannedBattle(b); if (b.result?.winner === 'atk') delegWin++; }
    // 아무거나: 공격 방침 무작위, 방어는 AI
    { const { g, setup } = make(seed); const b = M.equalBattle(g, setup); A.preparePlannedBattle(b, ['def']); A.setPlan(b, 'atk', P.defaultPlan(b, 'atk', P.ATK_POLICIES[i % P.ATK_POLICIES.length]!)); A.runPlannedBattle(b); if (b.result?.winner === 'atk') randWin++; }
  }
  const d = delegWin / n, x = randWin / n;
  r.info('BP-03', `위임 공격 승률 ${pct(d, 1)}% vs 아무 방침 ${pct(x, 1)}% (${n}회)`);
  if (d + 0.03 < x) r.warn('BP-03', '개발', `위임이 아무 방침보다 못함 (${pct(d, 1)}% < ${pct(x, 1)}%) — 위임 버튼이 함정이 됨`);
  else r.pass('BP-03', '위임이 아무 방침 이상');
});

// ───────── 4. 실기 시나리오 전투: 종료·위치·보고서 문장·약자 역전 ─────────
await r.check('BP-04 시나리오 실전 표본', () => {
  const scen = ['s184', 's190', 's194', 's200', 's208', 's219'];
  let n = 0, noEnd = 0, weaker = 0, weakerWin = 0, illegal = 0, overDays = 0;
  const badText: string[] = [], reasons = new Map<string, number>();
  const t = timer();
  let maxMs = 0;
  for (const sc of scen) {
    const g = newGame(sc, undefined, 7);
    for (const s of setups(g).slice(0, Math.max(4, N))) {
      const b = B.createBattle(g, structuredClone(s), null);
      const t1 = timer();
      A.preparePlannedBattle(b, ['atk', 'def']);
      A.runPlannedBattle(b);
      maxMs = Math.max(maxMs, t1());
      n++;
      if (!b.result) { noEnd++; continue; }
      if (b.day > b.maxDays + 1) overDays++;
      for (const u of b.units) if (u.status === 'active' && !B.passable(b, u, u.x, u.y)) illegal++;
      reasons.set(b.result.reason, (reasons.get(b.result.reason) ?? 0) + 1);
      const atk = b.units.filter((u) => u.side === 'atk').reduce((x, u) => x + u.startTroops, 0);
      const def = b.units.filter((u) => u.side === 'def').reduce((x, u) => x + u.startTroops, 0);
      if (atk < def * 0.6) { weaker++; if (b.result.winner === 'atk') weakerWin++; }
      for (const side of ['atk', 'def'] as const) {
        const rep = R.battleReport(b, side);
        const txt = [rep.reason, rep.matchupText, rep.advice, rep.myPolicy ?? '', rep.enemyPolicy ?? '', rep.mvp ?? '', rep.myExec?.note ?? ''].join(' / ');
        if (BAD_TEXT.test(txt) && badText.length < 8) badText.push(`${sc} ${s.id} ${side}: ${txt}`);
        if (!rep.reason || !rep.advice) badText.push(`${sc} ${s.id} ${side}: 사유/총평 빈칸`);
        if (!rep.enemyPolicy) badText.push(`${sc} ${s.id} ${side}: 적 방침 미공개 (설계: 결과 보고서에서 공개)`);
      }
      for (const line of b.log) if (BAD_TEXT.test(line) && badText.length < 12) badText.push(`${sc} 로그: ${line}`);
    }
  }
  const ms = t();
  r.info('BP-04', `실전 ${n}회, 평균 ${(ms / Math.max(1, n)).toFixed(0)}ms, 최장 ${maxMs.toFixed(0)}ms(폰 환산 ×${PHONE_SLOWDOWN} ≈ ${((maxMs * PHONE_SLOWDOWN) / 1000).toFixed(1)}s), 결과 사유 ${[...reasons].map(([k, v]) => `${k}:${v}`).join(', ')}`);
  if (noEnd) r.fail('BP-04a', 'S1', '개발', `끝나지 않은 작전 전투 ${noEnd}/${n} (2400틱 안전핀 도달)`); else r.pass('BP-04a', '모든 작전 전투가 끝남');
  if (illegal) r.fail('BP-04b', 'S2', '개발', `통과 불가 칸에 있는 부대 ${illegal}건`); else r.pass('BP-04b', '불가 칸 위치 0건');
  if (overDays) r.fail('BP-04c', 'S2', '개발', `최대 일수 넘긴 전투 ${overDays}건`); else r.pass('BP-04c', '일수 제한 지킴');
  if (badText.length) r.fail('BP-04d', 'S3', '개발', `보고서·로그 문장 문제 ${badText.length}건`, badText.join('\n')); else r.pass('BP-04d', '보고서·로그 문장 이상 없음');
  if (weaker && weakerWin / weaker > 0.15) r.warn('BP-04e', '개발', `병력 0.6배 미만 공격자의 승률 ${pct(weakerWin, weaker)}% (${weakerWin}/${weaker}) — 첫 달 판세 붕괴(PM-E1)와 연결`);
  else r.pass('BP-04e', `약자 공격 승률 ${weaker ? pct(weakerWin, weaker) : 0}% (${weakerWin}/${weaker})`);
  if (maxMs * PHONE_SLOWDOWN > 2000) r.warn('BP-04f', '개발', `"결과만 보기" 최장 ${maxMs.toFixed(0)}ms → 폰 환산 ${((maxMs * PHONE_SLOWDOWN) / 1000).toFixed(1)}s (2초 초과 시 멈춘 것처럼 보임)`);
  else r.pass('BP-04f', '결과만 보기 속도 폰 환산 2초 이내');
});

// ───────── 5. 결정론 · 작전 확정 후 저장 복원 ─────────
await r.check('BP-05 결정론·복원', () => {
  const run = (b: BattleState) => { A.runPlannedBattle(b); return JSON.stringify([b.result, b.tick]); };
  const { g, setup } = make(4242);
  const b1 = M.equalBattle(g, setup); A.preparePlannedBattle(b1, ['def']); A.setPlan(b1, 'atk', P.defaultPlan(b1, 'atk', 'atk_pincer'));
  const saved = JSON.stringify(b1);
  const b2 = JSON.parse(saved) as BattleState;
  const b3 = JSON.parse(saved) as BattleState;
  const x1 = run(b1), x2 = run(b2), x3 = run(b3);
  if (x1 !== x2 || x2 !== x3) r.fail('BP-05', 'S2', '개발', '작전 확정 직후 저장→불러오기 결과가 다름 (세이브 스컴/재현 불가)', `${x1}\n${x2}\n${x3}`);
  else r.pass('BP-05', '작전 확정 후 JSON 왕복·재실행 결과 동일');
  // 진행 중 저장
  const { g: g2, setup: s2 } = make(99);
  const c1 = M.equalBattle(g2, s2); A.preparePlannedBattle(c1, ['atk', 'def']); A.startPlannedBattle(c1); A.tickPlanned(c1, 60);
  const mid = JSON.stringify(c1);
  const y1 = run(c1), y2 = run(JSON.parse(mid));
  if (y1 !== y2) r.fail('BP-05b', 'S2', '개발', '관전 도중 저장→불러오기 후 결과가 달라짐', `${y1}\n${y2}`);
  else r.pass('BP-05b', '관전 도중 저장 복원 후 결과 동일');
});

// ───────── 6. 실행도: 장수 능력이 오르면 실행도도 올라야 ─────────
await r.check('BP-06 실행도 단조성', () => {
  const vals = [30, 50, 70, 90].map((st) => { const { g, setup } = make(1); const b = M.equalBattle(g, setup, { stat: st }); return P.executionOf(b, 'atk'); });
  const mono = vals.every((v, i) => i === 0 || v >= vals[i - 1]!);
  if (!mono) r.fail('BP-06', 'S3', '개발', `능력 30/50/70/90 → 실행도 ${vals.join('/')} — 능력이 높아도 실행도가 떨어짐`);
  else r.pass('BP-06', `능력 30/50/70/90 → 실행도 ${vals.join('/')}`);
  // 요구 실행도 못 미치는 방침을 고를 수 있는데 경고가 없으면 함정
  const { g, setup } = make(1);
  const b = M.equalBattle(g, setup, { stat: 30, training: 20 });
  const blocked = [...P.ATK_POLICIES].map((a) => [a, P.policyCheck(b, 'atk', a)] as const);
  const lowExec = P.executionOf(b, 'atk');
  const silent = blocked.filter(([a, c]) => c.ok && P.POLICIES[a].reqExec > lowExec + 15);
  // 엔진은 막지 않는다. 화면(Battle.tsx 작전 회의)이 '조금/크게 모자람' 경고를 띄우는 것으로 2026-11-13 확인 → INFO. 화면 경고는 D4-08 수동 확인
  if (silent.length) r.info('BP-06b', `실행도 ${lowExec}에서 요구 ${silent.map(([a]) => `${P.POLICIES[a].name}(${P.POLICIES[a].reqExec})`).join(', ')} 선택 가능 (엔진 허용, 화면 경고로 처리 — D4-08에서 경고 표시 확인)`);
  else r.pass('BP-06b', '요구 실행도 크게 모자란 방침은 막히거나 경고');
});

// ───────── 7. 방침 이름·설명 문장 ─────────
await r.check('BP-07 방침 문장', () => {
  const bad: string[] = [];
  for (const p of Object.values(P.POLICIES)) {
    const txt = JSON.stringify(p);
    if (BAD_TEXT.test(txt)) bad.push(`${p.id}: ${txt.slice(0, 160)}`);
    if (!p.name) bad.push(`${p.id}: 이름 없음`);
  }
  if (bad.length) r.fail('BP-07', 'S3', '개발', `방침 정의 문장 문제 ${bad.length}건`, bad.join('\n')); else r.pass('BP-07', `방침 ${Object.keys(P.POLICIES).length}종 문장 이상 없음`);
  const designed = { atk: 14, def: 14 };
  if (P.ATK_POLICIES.length < designed.atk || P.DEF_POLICIES.length < designed.def)
    r.info('BP-07b', `구현 방침 공격 ${P.ATK_POLICIES.length}/${designed.atk}, 방어 ${P.DEF_POLICIES.length}/${designed.def} (설계서 4·5장 14종 대비, 1단계 범위인지 개발 확인)`);
});

r.write();
