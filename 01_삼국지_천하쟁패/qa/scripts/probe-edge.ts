/**
 * 예외 상황 프로브 (설계노트 31·39장, 전달서 A5): 상황을 강제로 만들고 진행이 멈추거나 상태가 깨지지 않는지 본다.
 * 재현 세이브는 qa/results/<시각>/edge-*.json 으로 남긴다 (UI에서 불러와 눈으로 확인용).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, Report, invariants, nameOf, newGame, stepMonthAuto } from './lib';
import type { Game } from '../../src/engine/ctx';

const r = new Report('probe-edge');
const war = await import('../../src/engine/war');
const turn = await import('../../src/engine/turn');
const world = await import('../../src/engine/world');
const cmd = await import('../../src/engine/commands');
const saveEdge = (name: string, g: Game) => writeFileSync(join(OUT, `edge-${name}.json`), JSON.stringify({ format: 'samgukji-save', saveVersion: 2, meta: { slot: 'slot3', date: `${g.s.year}년 ${g.s.month}월`, label: `QA ${name}`, savedAt: Date.now() }, state: g.s }), 'utf8');
/** 몇 달 진행하며 예외·불변식 위반을 모은다 */
async function survive(g: Game, months: number, tag: string) {
  const v = new Set<string>();
  for (let i = 0; i < months && !g.s.ending; i++) {
    await stepMonthAuto(g, { playerPassive: true });
    for (const x of invariants(g)) if (!x.includes('몰년')) v.add(x);
  }
  if (v.size) r.fail(tag, 'S2', '개발', `진행 후 상태 이상 ${v.size}건`, [...v].slice(0, 15).join('\n'));
  return v.size === 0;
}
const player = (g: Game) => g.s.factions[g.s.playerFaction]!;

await r.check('39-1 군주 포로', async () => {
  // 군주를 혼자 소수 병력으로 강한 이웃 도시에 보낸다 → 잡힐 때까지 시드를 바꿔 시도
  for (let seed = 1; seed <= 40; seed++) {
    const g = newGame('s194', 'liu_bei', seed);
    const f = player(g); const ruler = g.s.officers[f.ruler]!;
    const target = world.neighborsOf(g, ruler.city).map((n) => g.s.cities[n.to]!).filter((c) => c.faction && c.faction !== f.id && world.officersIn(g, c.id, c.faction).some((o) => o.troops > 0))
      .sort((a, b) => world.officersIn(g, b.id, b.faction).reduce((s, o) => s + o.troops, 0) - world.officersIn(g, a.id, a.faction).reduce((s, o) => s + o.troops, 0))[0];
    if (!target) continue;
    ruler.troops = 300;
    const setup = cmd.prepareAttack(g, f.id, ruler.city, target.id, [ruler.id], 300);
    if (typeof setup === 'string') continue;
    g.s.messages = [];
    war.resolveAttackAuto(g, setup);
    if (g.s.officers[ruler.id]!.status !== 'captive') continue;
    const titles = g.s.messages.map((m) => m.title);
    saveEdge('ruler-captured', g);
    const newRuler = player(g).ruler;
    if (!player(g).alive) r.info('39-1', `seed ${seed}: 군주 포로 → 세력 멸망 처리`);
    else if (newRuler === ruler.id) r.fail('39-1', 'S2', '개발', '군주가 포로인데 군주가 그대로');
    else r.pass('39-1', `seed ${seed}: 군주 포로 → ${nameOf(newRuler)} 계승`);
    const causeAt = titles.findIndex((t) => t === '전투 결과' || t === '도시 함락');
    const effectAt = titles.findIndex((t) => t === '군주 포로' || t === '군주 계승');
    if (causeAt >= 0 && effectAt >= 0 && effectAt < causeAt) r.fail('D2-08', 'S3', '개발', `군주 포로 상황 팝업 순서가 결과→원인: ${titles.join(' → ')}`);
    else r.pass('D2-08', `팝업 순서: ${titles.join(' → ')}`);
    r.info('39-1', '39장 권장: 임시 대리 + 몸값 교섭/구출 + 6개월 후 판정. 현재는 즉시 영구 계승인지 확인 필요');
    // 포로가 된 옛 군주는 12개월 뒤 어떻게 되나
    await survive(g, 12, '39-1');
    r.info('39-1', `12개월 뒤 옛 군주 ${nameOf(ruler.id)} 상태: ${g.s.officers[ruler.id]!.status}${g.s.officers[ruler.id]!.faction ? ' / ' + g.s.officers[ruler.id]!.faction : ''}`);
    return;
  }
  r.skip('39-1', '40개 시드에서 군주 포로 상황을 못 만듦');
});

await r.check('39-2 군주·후계자 동시 사망', async () => {
  const g = newGame('s208', 'liu_bei', 2);
  const f = player(g); const first = f.ruler;
  war.killOfficer(g, first, '병사');
  const second = player(g).ruler;
  if (player(g).alive && second !== first) war.killOfficer(g, second, '병사');
  saveEdge('ruler-heir-dead', g);
  const after = player(g);
  if (after.alive && (after.ruler === first || after.ruler === second)) r.fail('39-2', 'S1', '개발', '두 번 죽은 뒤에도 죽은 군주가 남음');
  else r.pass('39-2', `동시 사망 → ${after.alive ? nameOf(after.ruler) + ' 즉위' : '멸망'}`);
  await survive(g, 6, '39-2');
});

await r.check('39-3/4 모든 도시 상실', async () => {
  const g = newGame('s194', 'liu_bei', 3);
  const f = player(g);
  // 플레이어 도시의 병력을 0으로 → 이웃 AI가 무혈 점령하게 둔다
  for (const o of Object.values(g.s.officers)) if (o.faction === f.id) o.troops = 0;
  let months = 0;
  for (; months < 36 && player(g).alive && !g.s.ending; months++) {
    for (const o of Object.values(g.s.officers)) if (o.faction === f.id && o.status === 'serving') o.troops = 0;
    await stepMonthAuto(g, { playerPassive: true });
  }
  saveEdge('all-cities-lost', g);
  if (player(g).alive) r.info('39-3', `36개월 뒤에도 생존 (도시 ${world.citiesOf(g, f.id).length}개) — AI가 빈 도시를 안 먹음`);
  else if (!g.s.ending || g.s.ending.type !== 'defeat') r.fail('39-3', 'S1', '개발', '플레이어 세력 멸망인데 패배 엔딩 없음');
  else r.pass('39-3', `${months}개월 만에 멸망 → 패배 엔딩 "${g.s.ending.text}"`);
  r.info('39-4', '방랑군·의탁(도시 0 + 군주 생존) 기능 유무: 현재 엔진은 도시 0이면 즉시 멸망(checkFactionAlive) — 39장 권장과 다름, 방침 확인');
  // 엔딩 뒤 진행해도 멈추지 않는가
  try { turn.finishMonth(g); r.pass('D3-13', '엔딩 후 월말 처리 호출해도 예외 없음'); } catch (e) { r.fail('D3-13', 'S2', '개발', `엔딩 후 예외 ${(e as Error).message}`); }
});

await r.check('39-6 같은 빈 도시 동시 진군', async () => {
  const g = newGame('s194', undefined, 4);
  // 공백 도시와 그에 인접한 서로 다른 두 세력을 찾는다
  for (const c of Object.values(g.s.cities)) {
    if (c.faction) continue;
    const ns = world.neighborsOf(g, c.id).map((n) => g.s.cities[n.to]!).filter((x) => x.faction && world.officersIn(g, x.id, x.faction).some((o) => o.troops > 0 && !o.acted));
    const fs = [...new Map(ns.map((x) => [x.faction!, x])).values()];
    if (fs.length < 2) continue;
    const mk = (src: typeof fs[number]) => { const o = world.officersIn(g, src.id, src.faction).find((x) => x.troops > 0)!; return cmd.prepareAttack(g, src.faction!, src.id, c.id, [o.id], Math.ceil(o.troops / 10)); };
    const a = mk(fs[0]!); const b = mk(fs[1]!);
    if (typeof a === 'string' || typeof b === 'string') continue;
    war.resolveAttackAuto(g, a);
    const fresh = war.refreshSetup(g, b);
    if (!fresh) { r.info('39-6', '두 번째 진군이 취소됨(동맹·정전 등)'); return; }
    const before = g.s.cities[c.id]!.faction;
    war.resolveAttackAuto(g, fresh);
    r.pass('39-6', `${g.ix.city.get(c.id)!.name}: 먼저 도착 ${g.s.factions[a.attacker]!.name} 입성 → 나중 ${g.s.factions[b.attacker]!.name}은 ${before === a.attacker ? '공성전' : '?'} → 결과 주인 ${g.s.factions[g.s.cities[c.id]!.faction ?? '']?.name ?? '공백'}`);
    const v = invariants(g).filter((x) => !x.includes('몰년'));
    if (v.length) r.fail('39-6', 'S2', '개발', '동시 진군 후 상태 이상', v.join('\n'));
    return;
  }
  r.skip('39-6', '조건 맞는 공백 도시 없음');
});

await r.check('39-11 이벤트 대상 사망', async () => {
  // 삼고초려 대상 제갈량을 미리 죽이고 207년을 넘긴다 → 이벤트가 터지거나 예외가 나면 안 됨
  const g = newGame('s200', 'liu_bei', 6);
  if (g.s.officers.zhuge_liang) war.killOfficer(g, 'zhuge_liang', '병사');
  const seen: string[] = [];
  for (let m = 0; m < 12 * 10; m++) for (const msg of await stepMonthAuto(g, { playerPassive: true })) if (msg.title === '삼고초려') seen.push(`${g.s.year}.${g.s.month}`);
  seen.length ? r.fail('39-11', 'S2', '시나리오', `죽은 제갈량으로 삼고초려 발동 ${seen.join(', ')}`) : r.pass('39-11', '대상 사망 시 삼고초려 미발동 (10년)');
  // 유비 사망 후 의형제 천리행
  const g2 = newGame('s200', 'liu_bei', 8);
  war.killOfficer(g2, 'liu_bei', '병사');
  let bad = 0; for (let m = 0; m < 60; m++) for (const msg of await stepMonthAuto(g2, { playerPassive: true })) if (msg.title.startsWith('천리행') && msg.text.includes('유비')) bad++;
  bad ? r.fail('39-11', 'S2', '시나리오', `죽은 유비에게 돌아가는 천리행 ${bad}회`) : r.pass('39-11', '유비 사망 후 유비에게 가는 천리행 없음');
});

await r.check('D3-13 통일 엔딩', async () => {
  const g = newGame('s219', undefined, 1);
  for (const f of Object.values(g.s.factions)) if (f.id !== g.s.playerFaction && f.alive) cmd.absorbFaction(g, f.id, g.s.playerFaction);
  turn.checkEnding(g);
  saveEdge('victory', g);
  g.s.ending?.type === 'victory' ? r.pass('D3-13', `통일 엔딩: "${g.s.ending.text}"`) : r.fail('D3-13', 'S1', '개발', '모든 세력 흡수 후 통일 엔딩 없음');
  const v = invariants(g).filter((x) => !x.includes('몰년'));
  if (v.length) r.fail('D3-13', 'S2', '개발', '흡수 후 상태 이상', v.slice(0, 10).join('\n'));
});

await r.check('31 의형제 분산', async () => {
  const g = newGame('s194', 'liu_bei', 12);
  // 관우·장비를 다른 세력으로 옮긴다
  const others = Object.values(g.s.factions).filter((f) => f.alive && f.id !== g.s.playerFaction);
  for (const [i, id] of ['guan_yu', 'zhang_fei'].entries()) {
    const f = others[i]!; const o = g.s.officers[id]; if (!o) continue;
    cmd.joinFaction(g, id, f.id, f.capital);
  }
  const ok = await survive(g, 24, '31 의형제');
  if (ok) r.pass('31', `의형제 분산 24개월 진행 정상 (관우: ${g.s.officers.guan_yu?.faction}, 장비: ${g.s.officers.zhang_fei?.faction})`);
});

await r.check('41-5 생년 불명', () => {
  const g = newGame('s194');
  const unknown = Object.values(g.ix.data.officers).filter((o) => o.debutYear - o.birthYear === 0 || o.birthYear <= 0);
  unknown.length ? r.warn('41-5', '시나리오', `생년이 비정상(0 또는 등장=출생)인 무장 ${unknown.length}명`, unknown.map((o) => o.name).join(', ')) : r.pass('41-5', '생년 값 정상 (추정 표시 여부는 UI 수동 확인)');
});

r.write();
