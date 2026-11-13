/**
 * 세이브 프로브: 왕복 일치·결정론, 손상/미래/옛 버전, 자동 저장 순환, 1,000턴 용량·속도.
 */
import { Report, engine, newGame, stepMonthAuto, timer } from './lib';
import { makeGame } from '../../src/engine/ctx';
import type { GameState } from '../../src/engine/state';

const r = new Report('probe-save');
const save = await import('../../src/engine/save');
const mem = new Map<string, string>();
if ('setSaveBackend' in save) save.setSaveBackend({ read: async (n) => mem.get(n) ?? null, write: async (n, t) => void mem.set(n, t), remove: async (n) => void mem.delete(n) });
else r.skip('backend', 'setSaveBackend 없음 — 메모리 저장소로 바꿀 수 없음');
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const run = async (s: GameState, months: number) => { const g = makeGame(engine().ix, s); for (let i = 0; i < months; i++) await stepMonthAuto(g); return g.s; };

await r.check('D6-01 결정론', async () => {
  const g = newGame('s194', undefined, 7);
  for (let i = 0; i < 6; i++) await stepMonthAuto(g);
  const snap = JSON.stringify(g.s);
  const a = await run(JSON.parse(snap), 12);
  const b = await run(JSON.parse(snap), 12);
  JSON.stringify(a) === JSON.stringify(b) ? r.pass('D6-01', '같은 상태에서 12개월 진행 결과 동일 (난수 상태 포함)') : r.fail('D6-01', 'S2', '개발', '같은 세이브에서 진행 결과가 다름 (결정론 깨짐)');
});

await r.check('D1-02 저장 왕복', async () => {
  const g = newGame('s200', undefined, 3);
  for (let i = 0; i < 5; i++) await stepMonthAuto(g);
  await save.saveGame(g.s, 'slot1', 'qa');
  const res = await save.loadGame('slot1');
  if (!res.ok) return r.fail('D1-02', 'S1', '개발', `방금 저장한 슬롯 불러오기 실패: ${res.error}`);
  JSON.stringify(res.payload.state) === JSON.stringify(g.s) ? r.pass('D1-02', '저장→불러오기 상태 동일') : r.fail('D1-02', 'S1', '개발', '저장→불러오기 후 상태가 다름');
  res.payload.saveVersion === save.SAVE_VERSION ? r.pass('D1-02', `saveVersion=${res.payload.saveVersion}`) : r.fail('D1-02', 'S2', '개발', `saveVersion ${res.payload.saveVersion} ≠ ${save.SAVE_VERSION}`);
});

await r.check('D6-02 손상 세이브', async () => {
  const good = mem.get('slot1')!;
  const cases: [string, string][] = [['빈 파일', ''], ['절반 잘림', good.slice(0, good.length / 2)], ['아무 글자', '삼국지!!'], ['null', 'null'], ['state 없음', '{"format":"samgukji-save","saveVersion":2}'],
    ['state 필드 누락', JSON.stringify({ ...JSON.parse(good), state: { year: 200 } })]];
  const bad: string[] = [];
  for (const [name, text] of cases) {
    try {
      const res = save.parseSave(text);
      if (res.ok && name !== 'state 필드 누락') bad.push(`${name}: 정상 세이브로 받아들임`);
      if (res.ok && name === 'state 필드 누락') {
        // 불러진 뒤 게임이 터지는지
        try { await run(res.payload.state, 1); bad.push(`${name}: 필드가 빠진 세이브를 받아들였는데 진행도 됨(검증 없음)`); }
        catch (e) { bad.push(`${name}: 받아들인 뒤 진행 시 예외 "${(e as Error).message}" — 불러오기 단계에서 걸러야 함`); }
      }
    } catch (e) { bad.push(`${name}: parseSave 예외 ${(e as Error).message}`); }
  }
  bad.length ? r.fail('D6-02', 'S2', '개발', `손상 세이브 처리 문제 ${bad.length}건`, bad.join('\n')) : r.pass('D6-02', '손상 세이브 6종 모두 안내 메시지로 거부');
});

await r.check('D1-02 버전', async () => {
  const p = JSON.parse(mem.get('slot1')!);
  const future = save.parseSave(JSON.stringify({ ...p, saveVersion: 99 }));
  !future.ok && /새로운|업데이트/.test(future.error) ? r.pass('D1-02', `미래 버전 안내: "${future.error}"`) : r.fail('D1-02', 'S2', '개발', '미래 버전 세이브를 안내 없이 처리');
  const legacy = save.parseSave(JSON.stringify({ meta: p.meta, state: { ...p.state, difficulty: undefined } }));
  legacy.ok && legacy.payload.saveVersion === save.SAVE_VERSION ? r.pass('D1-02', '버전 없는 옛 세이브 → 변환 성공') : r.fail('D1-02', 'S2', '개발', `옛 세이브 변환 실패 ${legacy.ok ? '' : legacy.error}`);
});

await r.check('D1-03 자동 저장 순환', async () => {
  if (!('autoSave' in save)) return r.skip('D1-03', 'autoSave 없음');
  for (const s of save.AUTO_SLOTS) mem.delete(s);
  const g = newGame('s194', undefined, 1);
  const used: string[] = [];
  for (let i = 0; i < 7; i++) { g.s.month = (i % 12) + 1; used.push(await save.autoSave(g.s, `t${i}`)); await sleep(5); }
  const expect = ['auto1', 'auto2', 'auto3', 'auto1', 'auto2', 'auto3', 'auto1'];
  used.join() === expect.join() ? r.pass('D1-03', `순환 ${used.join('→')}`) : r.fail('D1-03', 'S2', '개발', `순환 순서 이상 ${used.join('→')}`);
  // 같은 밀리초에 두 번 저장 (빠른 턴 넘기기)
  const t: string[] = []; for (let i = 0; i < 3; i++) t.push(await save.autoSave(g.s, `fast${i}`));
  new Set(t).size === 3 ? r.pass('D1-03', '연속 빠른 자동 저장도 서로 다른 칸') : r.warn('D1-03', '개발', `같은 밀리초 연속 자동 저장이 같은 칸에 씀: ${t.join(',')} (savedAt 동률 처리)`);
  // 한 칸이 깨져도 나머지는 목록에 보임
  mem.set('auto2', '{깨짐');
  const list = await save.listSaves();
  const ok = list.filter((x) => x.slot.startsWith('auto') && x.meta).length;
  ok === 2 ? r.pass('D1-03', '깨진 자동 저장 1칸 → 나머지 2칸 정상 표시') : r.fail('D1-03', 'S2', '개발', `깨진 칸 이후 정상 칸 ${ok}개`);
  const broken = list.find((x) => x.slot === 'auto2');
  broken?.error ? r.pass('D1-03', `깨진 칸 오류 표시: "${broken.error}"`) : r.warn('D1-03', '디자인', '깨진 칸에 오류 표시 없음');
});

await r.check('D6-03 1,000턴', async () => {
  const g = newGame('s184', undefined, 11);
  const t = timer(); let months = 0;
  for (; months < 1000 && !g.s.ending; months++) await stepMonthAuto(g);
  const simMs = t();
  const t2 = timer(); const text = JSON.stringify({ format: 'samgukji-save', saveVersion: save.SAVE_VERSION, meta: {}, state: g.s }); const ser = t2();
  const t3 = timer(); const res = save.parseSave(text); const par = t3();
  const kb = Math.round(Buffer.byteLength(text) / 1024);
  r.info('D6-03', `${months}개월 진행(${(simMs / 1000).toFixed(1)}s, ${g.s.year}년${g.s.ending ? ' 엔딩' : ''}) → 세이브 ${kb}KB, 직렬화 ${ser.toFixed(0)}ms, 해석 ${par.toFixed(0)}ms, 로그 ${g.s.log.length}줄`);
  if (!res.ok) r.fail('D6-03', 'S1', '개발', '장기 진행 세이브 해석 실패');
  else if (ser + par > 3000) r.fail('D6-03', 'S2', '개발', `저장+불러오기 ${(ser + par).toFixed(0)}ms > 3s`);
  else r.pass('D6-03', '장기 세이브 3초 이내');
  if (kb > 5000) r.warn('D6-03', '개발', `세이브 ${kb}KB — 로그가 무한 증가하는지 확인 (로그 ${g.s.log.length}줄)`);
});

r.write();
