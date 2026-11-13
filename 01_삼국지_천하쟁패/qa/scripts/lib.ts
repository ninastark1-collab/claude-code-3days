/**
 * QA 프로브 공통 도구. 게임 코드를 수정하지 않고 엔진 API만 읽어서 검사한다.
 * 엔진 API가 바뀌어 검사를 못 하면 SKIP으로 기록하고 계속 진행한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadGameData } from '../../src/data/gameData';
import { indexData, makeGame, type Game, type DataIndex } from '../../src/engine/ctx';
import { createGameState } from '../../src/engine/state';
import type { GameData } from '../../src/data/validate';

export type Severity = 'S1' | 'S2' | 'S3' | 'S4';
export type Owner = '개발' | '시나리오' | '디자인';
type Row = { kind: 'PASS' | 'FAIL' | 'WARN' | 'INFO' | 'SKIP'; id: string; msg: string; sev?: Severity; owner?: Owner; detail?: string };

export const OUT = resolve(process.env.QA_OUT ?? join('qa', 'results', 'adhoc'));
mkdirSync(OUT, { recursive: true });

export class Report {
  rows: Row[] = [];
  started = Date.now();
  constructor(public name: string) {}
  pass(id: string, msg: string) { this.rows.push({ kind: 'PASS', id, msg }); }
  fail(id: string, sev: Severity, owner: Owner, msg: string, detail?: string) { this.rows.push({ kind: 'FAIL', id, msg, sev, owner, detail }); }
  warn(id: string, owner: Owner, msg: string, detail?: string) { this.rows.push({ kind: 'WARN', id, msg, owner, detail }); }
  info(id: string, msg: string, detail?: string) { this.rows.push({ kind: 'INFO', id, msg, detail }); }
  skip(id: string, msg: string) { this.rows.push({ kind: 'SKIP', id, msg }); }
  /** 검사 하나를 감싸서, 예외가 나도 다음 검사로 넘어간다 */
  async check(id: string, fn: () => void | Promise<void>) {
    try { await fn(); }
    catch (e) {
      const err = e as Error;
      if (err?.message?.startsWith('SKIP:')) this.skip(id, err.message.slice(5).trim());
      else this.fail(id, 'S1', '개발', `검사 중 엔진 예외: ${err?.message ?? e}`, err?.stack?.split('\n').slice(0, 6).join('\n'));
    }
  }
  count(kind: Row['kind']) { return this.rows.filter((r) => r.kind === kind).length; }
  write() {
    const secs = ((Date.now() - this.started) / 1000).toFixed(1);
    const head = `# ${this.name}\n\n실행 시간 ${secs}s · PASS ${this.count('PASS')} · FAIL ${this.count('FAIL')} · WARN ${this.count('WARN')} · SKIP ${this.count('SKIP')} · INFO ${this.count('INFO')}\n\n`;
    const order = { FAIL: 0, WARN: 1, SKIP: 2, INFO: 3, PASS: 4 } as const;
    const rows = [...this.rows].sort((a, b) => order[a.kind] - order[b.kind]);
    const table = ['| 결과 | ID | 심각도 | 담당 | 내용 |', '|---|---|---|---|---|',
      ...rows.map((r) => `| ${r.kind} | ${r.id} | ${r.sev ?? ''} | ${r.owner ?? ''} | ${esc(r.msg)} |`)].join('\n');
    const details = rows.filter((r) => r.detail).map((r) => `### ${r.kind} ${r.id}\n\n\`\`\`\n${r.detail}\n\`\`\``).join('\n\n');
    const text = head + table + (details ? `\n\n## 상세\n\n${details}\n` : '\n');
    const file = join(OUT, `${this.name}.md`);
    writeFileSync(file, text, 'utf8');
    console.log(`[${this.name}] PASS ${this.count('PASS')} FAIL ${this.count('FAIL')} WARN ${this.count('WARN')} SKIP ${this.count('SKIP')} → ${file}`);
    process.exitCode = this.count('FAIL') ? 1 : 0;
  }
}
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
export const skip = (why: string): never => { throw new Error(`SKIP: ${why}`); };

// ───────────── 엔진 로드 ─────────────
let cached: { data: GameData; ix: DataIndex } | null = null;
export function engine() {
  if (!cached) { const data = loadGameData(); cached = { data, ix: indexData(data) }; }
  return cached;
}
export const SCENARIOS = () => engine().data.scenarios.map((s) => s.id);
export function newGame(scenario: string, faction?: string, seed = 1, opts: Record<string, unknown> = {}): Game {
  const { data, ix } = engine();
  const sc = data.scenarios.find((s) => s.id === scenario) ?? skip(`시나리오 ${scenario} 없음`);
  const f = faction ?? sc.factions[0]!.id;
  return makeGame(ix, createGameState(data, scenario, f, { seed, ...opts } as never));
}
export const nameOf = (id: string) => engine().ix.officer.get(id)?.name ?? id;
/** 한국어 이름으로 무장 id 찾기 (동명이인은 전부) */
export function idsByName(name: string): string[] {
  return engine().data.officers.filter((o) => o.name === name).map((o) => o.id);
}

// ───────────── 불변식 ─────────────
/** 한 시점의 게임 상태가 말이 되는지 검사. 위반 목록을 돌려준다 */
export function invariants(g: Game, maxTroops?: (g: Game, id: string) => number): string[] {
  const s = g.s; const v: string[] = [];
  const num = (x: unknown, where: string) => { if (typeof x !== 'number' || !Number.isFinite(x)) v.push(`숫자 아님(NaN/∞): ${where}=${x}`); };
  for (const c of Object.values(s.cities)) {
    const cb = g.ix.city.get(c.id);
    if (!cb) { v.push(`없는 도시 id: ${c.id}`); continue; }
    for (const k of ['population', 'gold', 'food', 'agriculture', 'commerce', 'walls', 'order', 'support'] as const) {
      num(c[k], `${cb.name}.${k}`);
      if ((c[k] as number) < 0) v.push(`${cb.name}.${k} 음수 ${c[k]}`);
    }
    if (c.population > cb.maxPopulation) v.push(`${cb.name} 인구 ${c.population} > 상한 ${cb.maxPopulation}`);
    if (c.agriculture > cb.maxAgriculture) v.push(`${cb.name} 농업 ${c.agriculture} > 상한 ${cb.maxAgriculture}`);
    if (c.commerce > cb.maxCommerce) v.push(`${cb.name} 상업 ${c.commerce} > 상한 ${cb.maxCommerce}`);
    if (c.walls > cb.maxWalls) v.push(`${cb.name} 성벽 ${c.walls} > 상한 ${cb.maxWalls}`);
    if (c.order > 100 || c.support > 100) v.push(`${cb.name} 치안/민심 100 초과`);
    if (c.faction && !s.factions[c.faction]?.alive) v.push(`${cb.name} 소유 세력 ${c.faction} 멸망/없음`);
    if (c.governor) {
      const go = s.officers[c.governor];
      if (!go || go.status !== 'serving' || go.city !== c.id || go.faction !== c.faction) v.push(`${cb.name} 태수 ${nameOf(c.governor)} 부적합(상태 ${go?.status}, 위치 ${go?.city}, 소속 ${go?.faction})`);
    } else if (c.faction && Object.values(s.officers).some((o) => o.status === 'serving' && o.city === c.id && o.faction === c.faction)) {
      v.push(`${cb.name} 무장이 있는데 태수 없음`);
    }
  }
  for (const f of Object.values(s.factions)) {
    if (!f.alive) continue;
    const owned = Object.values(s.cities).filter((c) => c.faction === f.id).length;
    if (owned === 0) v.push(`${f.name} 생존인데 도시 0`);
    const r = s.officers[f.ruler];
    if (!r || r.status !== 'serving' || r.faction !== f.id) v.push(`${f.name} 군주 ${nameOf(f.ruler)} 상태 ${r?.status}/${r?.faction}`);
    if (owned && s.cities[f.capital]?.faction !== f.id) v.push(`${f.name} 수도 ${f.capital} 미소유`);
  }
  for (const o of Object.values(s.officers)) {
    const n = nameOf(o.id);
    num(o.troops, `${n}.troops`); num(o.loyalty, `${n}.loyalty`);
    if (o.troops < 0) v.push(`${n} 병력 음수`);
    if (o.status !== 'serving' && o.troops > 0) v.push(`${n} (${o.status}) 병력 ${o.troops} 보유`);
    if (o.status === 'serving') {
      if (!o.faction || !s.factions[o.faction]?.alive) v.push(`${n} 소속 세력 ${o.faction} 없음/멸망`);
      if (!s.cities[o.city]) v.push(`${n} 위치 도시 없음 ${o.city}`);
      else if (s.cities[o.city]!.faction !== o.faction) v.push(`${n} 적/공백 도시 ${g.ix.city.get(o.city)?.name}에 주둔 (소속 ${o.faction}, 도시 ${s.cities[o.city]!.faction})`);
      if (maxTroops && o.troops > maxTroops(g, o.id) * 1.001) v.push(`${n} 병력 ${o.troops} > 지휘 상한 ${maxTroops(g, o.id)}`);
      if (o.loyalty < 0 || o.loyalty > 100) v.push(`${n} 충성 범위 밖 ${o.loyalty}`);
    }
    if (o.status === 'captive') {
      if (!o.captor || !s.factions[o.captor]?.alive) v.push(`${n} 포로인데 잡은 세력 없음/멸망 (${o.captor})`);
    }
    const b = g.ix.officer.get(o.id);
    if (b && o.status !== 'dead' && o.status !== 'unborn' && s.year > b.deathYear + 3) v.push(`${n} 몰년 ${b.deathYear} 지나 ${s.year}년에도 생존(${o.status})`);
  }
  for (const [k, r] of Object.entries(s.relations)) if (r.friendship < 0 || r.friendship > 100) v.push(`관계 ${k} 우호도 범위 밖 ${r.friendship}`);
  return v;
}

/** 플레이어 세력도 AI가 움직이게 한 달 진행 (scripts/simulate.ts 와 같은 방식). 메시지 목록을 돌려준다 */
export async function stepMonthAuto(g: Game, opts: { playerPassive?: boolean } = {}) {
  const turn = await import('../../src/engine/turn');
  const war = await import('../../src/engine/war');
  const player = g.s.playerFaction;
  if (!opts.playerPassive) g.s.playerFaction = '__none__';
  turn.runAiPhase(g);
  while (g.s.pendingBattles.length) war.resolveAttackAuto(g, g.s.pendingBattles.shift()!);
  g.s.playerFaction = player;
  turn.finishMonth(g);
  const msgs = g.s.messages.slice();
  // UI가 하던 일: 메시지·제안 비우기 (안 비우면 다음 달에 섞임)
  g.s.messages = [];
  g.s.proposals = [];
  if (g.s.notices) g.s.notices = [];
  return msgs;
}

export function timer() { const t = process.hrtime.bigint(); return () => Number(process.hrtime.bigint() - t) / 1e6; }
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
