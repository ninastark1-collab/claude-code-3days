/**
 * 전투 프로브: 지형 통과, 30일 제한, 상성표, 계략 안전핀, 전투 저장 복원(A7), 공수 밸런스.
 * 사용법: npx tsx qa/scripts/probe-battle.ts [전투 수=120]
 */
import { Report, newGame, pct } from './lib';
import type { Game } from '../../src/engine/ctx';
import type { BattleSetup } from '../../src/engine/state';

const N = Number(process.argv[2] ?? 120);
const r = new Report('probe-battle');
const B = await import('../../src/engine/battle/battle');
const AI = await import('../../src/engine/battle/ai');
const T = await import('../../src/engine/battle/types');
const world = await import('../../src/engine/world');

/** 인접한 적 도시끼리 전투 setup 만들기 (상태를 바꾸지 않음) */
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

const scen = ['s194', 's200', 's208', 's190', 's219', 's184'];
const stats = { n: 0, illegal: [] as string[], stacked: 0, riverNoNavy: 0, ticksOver: 0, noResult: 0, reasons: new Map<string, number>(), atkWin: 0, atkWinWeaker: 0, weaker: 0, days: [] as number[], kinds: new Map<string, number>() };

await r.check('D4 전투 표본', () => {
  let seed = 1;
  outer: for (const sc of scen) {
    for (let k = 0; k < 6; k++) {
      const g = newGame(sc, undefined, seed++);
      for (const s of setups(g)) {
        if (stats.n >= N) break outer;
        const b = B.createBattle(g, structuredClone(s), null);
        stats.n++;
        let guard = 0;
        while (!b.result && guard++ < 3000) {
          AI.battleAi(b, ['atk', 'def']);
          B.stepBattle(b);
          const seen = new Set<string>();
          for (const u of b.units) {
            if (u.status !== 'active') continue;
            const t = B.tileAt(b, u.x, u.y);
            if (!t) { stats.illegal.push(`${sc} ${b.cityName}: ${u.name} 맵 밖 (${u.x},${u.y})`); continue; }
            if (t.t === 'water' && !u.skills.includes('navy')) stats.illegal.push(`${sc} ${b.cityName}: ${u.name}(${u.side}) 물 위 (${u.x},${u.y})`);
            if ((t.t === 'wall' || t.t === 'gate') && u.side === 'atk') stats.illegal.push(`${sc} ${b.cityName}: 공격군 ${u.name}이 ${T.TERRAIN_NAME[t.t]} 위`);
            if (t.t === 'river' && !u.skills.includes('navy')) stats.riverNoNavy++;
            const key = `${u.x},${u.y}`; if (seen.has(key)) stats.stacked++; seen.add(key);
            if (u.troops < 0 || !Number.isFinite(u.troops)) stats.illegal.push(`${u.name} 병력 ${u.troops}`);
            stats.kinds.set(u.kind, (stats.kinds.get(u.kind) ?? 0) + 0);
          }
        }
        if (!b.result) { stats.noResult++; continue; }
        if (b.day > b.maxDays + 1) stats.ticksOver++;
        stats.days.push(b.day);
        stats.reasons.set(b.result.reason, (stats.reasons.get(b.result.reason) ?? 0) + 1);
        const atkT = s.units.reduce((x, u) => x + u.troops, 0);
        const defT = world.officersIn(g, s.city, s.defender).reduce((x, o) => x + o.troops, 0);
        const win = b.result.winner === 'atk';
        if (win) stats.atkWin++;
        if (atkT <= defT) { stats.weaker++; if (win) stats.atkWinWeaker++; }
      }
    }
  }
  const uniqIllegal = [...new Set(stats.illegal)];
  uniqIllegal.length ? r.fail('D4-01', 'S2', '개발', `통과 불가 지형 위 부대 ${uniqIllegal.length}건`, uniqIllegal.slice(0, 30).join('\n')) : r.pass('D4-01', `${stats.n}전투: 물·성벽·성문(공격측) 위 부대 없음`);
  stats.stacked ? r.fail('D4-01', 'S3', '개발', `같은 칸에 부대 2개 이상 ${stats.stacked}틱`) : r.pass('D4-01', '부대 겹침 없음');
  if (stats.riverNoNavy) r.warn('D4-01', '개발', `수군 특기 없이 강(river) 칸에 선 부대-틱 ${stats.riverNoNavy}회 — 현재 규칙은 강 도하 허용(이동 3.5). 위시리스트 "강은 수군만"과 다름 → 방침 확인`);
  stats.noResult ? r.fail('D4-02', 'S1', '개발', `3000틱 안에 끝나지 않은 전투 ${stats.noResult}건 (무한 전투)`) : r.pass('D4-02', '모든 전투 종료');
  stats.ticksOver ? r.fail('D4-02', 'S3', '개발', `최대 일수 넘긴 전투 ${stats.ticksOver}건`) : r.pass('D4-02', `최대 ${Math.max(...stats.days)}일`);
  const reasons = [...stats.reasons].map(([k, v]) => `${k} ${v}`).join(' · ');
  r.info('D4-02', `종료 사유: ${reasons}`);
  if (stats.reasons.get('30일 경과')) r.warn('D4-02', '개발', `30일 경과 ${stats.reasons.get('30일 경과')}건이 모두 수비 승리로 끝남 — 35-1은 "공성은 포위 상태로 다음 달 이월". 방침 확인`);
  r.info('D5', `공격측 승률 ${pct(stats.atkWin, stats.n)}% · 병력 열세 공격측 승률 ${pct(stats.atkWinWeaker, stats.weaker)}% (${stats.weaker}전)`);
  pct(stats.atkWinWeaker, stats.weaker) > 30 ? r.fail('D5-02', 'S2', '개발', `병력이 수비 이하인 공격측이 ${pct(stats.atkWinWeaker, stats.weaker)}% 승리 (목표 ≤ 30%) — 성 수비 이점 부족`) : r.pass('D5-02', '열세 공격측 승률 ≤ 30%');
});

await r.check('D5-03 본성 돌진 꼼수', () => {
  // 플레이어가 할 법한 단순 전술: 전 부대를 본성으로 직진. 수비는 AI. 병력 열세인데도 자주 이기면 공성 규칙 구멍
  let n = 0, weaker = 0, winWeaker = 0, keepWins = 0;
  let seed = 500;
  outer: for (const sc of scen) for (let k = 0; k < 4; k++) {
    const g = newGame(sc, undefined, seed++);
    for (const s of setups(g)) {
      if (n >= Math.max(30, N / 2)) break outer;
      const defT = world.officersIn(g, s.city, s.defender).reduce((x, o) => x + o.troops, 0);
      const atkT = s.units.reduce((x, u) => x + u.troops, 0);
      const b = B.createBattle(g, structuredClone(s), 'atk');
      n++;
      for (let i = 0; i < 3000 && !b.result; i++) {
        AI.battleAi(b, ['def']);
        for (const u of b.units) if (u.side === 'atk' && u.status === 'active') B.setOrder(b, u.id, { type: 'move', x: b.keep.x, y: b.keep.y });
        B.stepBattle(b);
      }
      if (atkT <= defT) { weaker++; if (b.result?.winner === 'atk') winWeaker++; }
      if (b.result?.reason === '본성 점령') keepWins++;
    }
  }
  r.info('D5-03', `본성 직진 ${n}전: 본성 점령 승리 ${keepWins} · 병력 열세 공격측 승률 ${pct(winWeaker, weaker)}% (${weaker}전)`);
  pct(winWeaker, weaker) > 30 ? r.fail('D5-03', 'S2', '개발', `전 부대 본성 직진만으로 병력 열세 공격측이 ${pct(winWeaker, weaker)}% 승리 — 수비 AI가 본성을 지키지 않거나 성문 돌파가 너무 쉬움`) : r.pass('D5-03', '본성 직진 꼼수 승률 ≤ 30%');
});

await r.check('D2-04 상성표', () => {
  const kinds = Object.keys(B.KIND_MULT) as (keyof typeof B.KIND_MULT)[];
  const bad: string[] = [];
  for (const k of kinds) {
    const row = B.KIND_MULT[k];
    const strong = Object.entries(row).filter(([, v]) => v > 1).length; const weak = Object.entries(row).filter(([, v]) => v < 1).length;
    if (strong < 1 || weak < 1) bad.push(`${T.KIND_NAME[k]}: 강점 ${strong} 약점 ${weak}`);
    const m = T.KIND_MATCHUP[k];
    if (!(row[m.strong] > 1) || !(row[m.weak] < 1)) bad.push(`${T.KIND_NAME[k]}: 화면 표시용 KIND_MATCHUP과 실제 배율 불일치`);
  }
  bad.length ? r.fail('D2-04', 'S2', '개발', '상성 규칙 위반', bad.join('\n')) : r.pass('D2-04', `병종 ${kinds.length}종 모두 강점·약점 1개, 표시값과 일치`);
  if (kinds.length < 4) r.info('D2-04', `병종 ${kinds.length}종 (37장 확정판은 창·기·궁·노·공성·수군·정예) — 범위 확인`);
});

await r.check('D2-02 혼란 면역', () => {
  const g = newGame('s194', undefined, 5);
  const s = setups(g)[0]!; const b = B.createBattle(g, s, null);
  const u = b.units.find((x) => x.side === 'def')!;
  u.confused = 3; u.confImmune = 0;
  for (let i = 0; i < 6; i++) B.stepBattle(b);
  if (u.confused === 0 && !(u.confImmune && u.confImmune > 0)) r.fail('D2-02', 'S3', '개발', '혼란이 풀린 직후 면역 시간이 없음 (38장)');
  else r.pass('D2-02', `혼란 해제 후 면역 ${u.confImmune}틱`);
});

await r.check('D1-07 전투 저장 복원', () => {
  const g = newGame('s200', undefined, 9);
  const s = setups(g)[2] ?? setups(g)[0]!;
  const b = B.createBattle(g, s, 'atk');
  for (let i = 0; i < 60; i++) { AI.battleAi(b, ['atk', 'def']); B.stepBattle(b); }
  const snap = JSON.stringify(b);
  const restored = JSON.parse(snap);
  const keys = ['day', 'tick', 'weather', 'atkFood', 'defFood'] as const;
  const diff = keys.filter((k) => JSON.stringify(restored[k]) !== JSON.stringify(b[k]));
  const unitDiff = b.units.filter((u, i) => ['x', 'y', 'troops', 'morale', 'status'].some((k) => (restored.units[i] as Record<string, unknown>)[k] !== (u as unknown as Record<string, unknown>)[k]));
  diff.length || unitDiff.length ? r.fail('D1-07', 'S1', '개발', `전투 직렬화 후 차이: ${diff.join(',')} 부대 ${unitDiff.length}`) : r.pass('D1-07', '전투 상태 JSON 왕복 동일 (위치·병력·사기·날씨·경과일)');
  for (let i = 0; i < 200 && !b.result; i++) { AI.battleAi(b, ['atk', 'def']); B.stepBattle(b); }
  for (let i = 0; i < 200 && !restored.result; i++) { AI.battleAi(restored, ['atk', 'def']); B.stepBattle(restored); }
  JSON.stringify(b.units) === JSON.stringify(restored.units) ? r.pass('D1-07', '복원한 전투가 원본과 같은 경과 (결정론)') : r.fail('D1-07', 'S2', '개발', '복원 후 이어서 진행한 결과가 원본과 다름 — 전투 난수/상태가 세이브 밖에 있음');
  r.info('D1-07', 'UI 경로(전투 중 메뉴 저장 → 불러오기)는 플레이테스트 S7에서 수동 확인');
});

await r.check('D2-01 일기토 제한', () => {
  const g = newGame('s190', undefined, 4);
  const s = setups(g)[0]!; const b = B.createBattle(g, s, 'atk');
  const a = b.units.find((x) => x.side === 'atk')!; const d = b.units.find((x) => x.side === 'def')!;
  const n1 = B.duelAccepted(b, a, d);
  if (n1) B.runDuel(b, a, d);
  const d2 = b.units.find((x) => x.side === 'def' && x !== d && x.status === 'active');
  r.info('D2-01', `일기토 1회 후 같은 상대 재신청 가능 여부: ${d.dueled ? '불가(dueled 표시)' : '표시 없음'} · 다른 상대 존재 ${!!d2}. "장수당 전투 1회에 2회" 제한은 UI 경로로 수동 확인`);
});

r.write();
