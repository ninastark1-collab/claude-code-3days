import { loadGameData } from '../src/data/gameData';
import { SAVE_VERSION, autoSave, listSaves, loadGame, parseSave, saveGame, setSaveBackend } from '../src/engine/save';
import { createGameState } from '../src/engine/state';
import { createBattle, stepBattle } from '../src/engine/battle/battle';
import { battleAi } from '../src/engine/battle/ai';
import { prepareAttack } from '../src/engine/commands';
import { indexData, makeGame } from '../src/engine/ctx';

const data = loadGameData();
const store = new Map<string, string>();
let failWrites = false;
setSaveBackend({
  read: async (n) => store.get(n) ?? null,
  write: async (n, t) => {
    if (failWrites) throw new Error('강제 종료 흉내');
    store.set(n, t);
  },
  remove: async (n) => void store.delete(n),
});

const newState = (month = 1) => {
  const s = createGameState(data, 's194', 'liu_bei', 1);
  s.month = month;
  return s;
};

describe('세이브 버전 (A2)', () => {
  it('저장한 세이브에는 버전이 들어가고 그대로 불러와진다', async () => {
    await saveGame(newState(), 'slot1', '유비군');
    expect(JSON.parse(store.get('slot1')!).saveVersion).toBe(SAVE_VERSION);
    const r = await loadGame('slot1');
    expect(r.ok && r.payload.state.scenarioId).toBe('s194');
  });

  it('버전 없는 옛 세이브(v1)는 변환해서 불러온다', () => {
    const old = newState();
    delete (old as { difficulty?: string }).difficulty;
    const r = parseSave(JSON.stringify({ meta: { slot: 0, date: '', label: '', savedAt: 0 }, state: old }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.saveVersion).toBe(SAVE_VERSION);
      expect(r.payload.state.difficulty).toBe('normal');
    }
  });

  it('더 새로운 버전의 세이브는 안내 메시지를 돌려준다', () => {
    const r = parseSave(JSON.stringify({ format: 'samgukji-save', saveVersion: SAVE_VERSION + 1, meta: {}, state: newState() }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('새로운 버전');
  });

  it('깨진 파일은 안내 메시지를 돌려준다', () => {
    const r = parseSave('{"format":"samgukji-sa');
    expect(r.ok).toBe(false);
  });
});

describe('전투 중 저장·불러오기 (A7)', () => {
  it('불러온 전투는 부대 위치·병력·사기·날씨가 같고, 이어서 진행해도 결과가 같다', async () => {
    const st = newState();
    const g = makeGame(indexData(data), st);
    st.cities.chenliu!.food = 99999;
    const setup = prepareAttack(g, 'cao', 'chenliu', 'puyang', ['cao_cao', 'xiahou_dun'], 8000);
    if (typeof setup === 'string') throw new Error(setup);
    const b = createBattle(g, setup, 'atk');
    for (let i = 0; i < 40; i++) {
      battleAi(b, ['def']);
      stepBattle(b);
    }
    await saveGame(g.s, 'slot2', '조조군', { state: b, isDefense: false });
    const r = await loadGame('slot2');
    if (!r.ok) throw new Error(r.error);
    const lb = r.payload.battle!.state;
    const snap = (x: typeof b) => x.units.map((u) => [u.id, u.x, u.y, u.troops, Math.round(u.morale * 100)]);
    expect(snap(lb)).toEqual(snap(b));
    expect(lb.weather).toBe(b.weather);
    expect(lb.day).toBe(b.day);
    expect(r.payload.meta.inBattle).toBe(true);
    // 같은 지점에서 이어 가면 똑같이 흘러간다 (난수 상태까지 저장됨)
    for (let i = 0; i < 60; i++) {
      battleAi(b, ['def']);
      stepBattle(b);
      battleAi(lb, ['def']);
      stepBattle(lb);
    }
    expect(snap(lb)).toEqual(snap(b));
  });
});

describe('자동 저장 순환 (A3)', () => {
  it('자동 저장은 3칸을 돌아가며 쓴다', async () => {
    store.clear();
    const used = [];
    for (let m = 1; m <= 4; m++) {
      used.push(await autoSave(newState(m), '유비군'));
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(used.slice(0, 3).sort()).toEqual(['auto1', 'auto2', 'auto3']);
    expect(used[3]).toBe(used[0]); // 4번째는 가장 오래된 칸
  });

  it('저장 도중 실패해도 기존 자동 저장 칸은 그대로 남는다', async () => {
    const before = (await listSaves()).filter((x) => x.slot.startsWith('auto')).map((x) => x.meta?.date);
    failWrites = true;
    await expect(autoSave(newState(9), '유비군')).rejects.toThrow();
    failWrites = false;
    const after = (await listSaves()).filter((x) => x.slot.startsWith('auto')).map((x) => x.meta?.date);
    expect(after).toEqual(before);
  });
});

describe('QA-DEV-04 손상 세이브 검증', () => {
  const wrap = (state: unknown) => JSON.stringify({ format: 'samgukji-save', saveVersion: SAVE_VERSION, meta: { slot: 'slot1', date: '', label: '', savedAt: 0 }, state });
  it('state 필수 필드가 빠진 세이브는 불러오기 단계에서 거부한다', () => {
    const r = parseSave(wrap({ year: 200 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('손상');
  });
  it('무장 하나의 필드가 빠지거나 형이 틀려도 거부한다', () => {
    const s = newState() as unknown as { officers: Record<string, Record<string, unknown>>; cities: Record<string, Record<string, unknown>> };
    const id = Object.keys(s.officers)[0]!;
    delete s.officers[id]!.loyalty;
    expect(parseSave(wrap(s)).ok).toBe(false);
    const s2 = newState() as unknown as { cities: Record<string, Record<string, unknown>> };
    s2.cities[Object.keys(s2.cities)[0]!]!.gold = 'many';
    expect(parseSave(wrap(s2)).ok).toBe(false);
  });
  it('정상 세이브는 그대로 통과한다', () => {
    expect(parseSave(wrap(newState())).ok).toBe(true);
  });
});

describe('QA-DEV-03 앱을 내릴 때 저장', () => {
  it('달 중간 상태(이번 달 명령)를 남기고, 같은 달 안에서는 한 칸만 덮어써 이전 달 자동 저장을 지킨다', async () => {
    const { suspendSave } = await import('../src/engine/save');
    store.clear();
    const prev = newState(3);
    await autoSave(prev, '3월 말');
    await new Promise((r) => setTimeout(r, 5));
    const s = newState(4);
    const id = Object.keys(s.officers).find((k) => s.officers[k]!.faction === 'liu_bei')!;
    s.officers[id]!.acted = true; // 이번 달 명령 하나
    const a = await suspendSave(s, '4월 중간');
    await new Promise((r) => setTimeout(r, 5));
    const b = await suspendSave(s, '4월 중간');
    expect(a).toBe(b); // 같은 달 두 번째는 같은 칸
    const r = await loadGame(a);
    expect(r.ok && r.payload.state.officers[id]!.acted).toBe(true);
    const metas = (await listSaves()).filter((x) => x.meta && x.slot.startsWith('auto'));
    expect(metas.map((x) => x.meta!.date).sort()).toEqual(['194년 3월', '194년 4월']);
  });

  it('전투 중 내려도 전투 상태가 같이 저장된다', async () => {
    const { suspendSave } = await import('../src/engine/save');
    store.clear();
    const fake = { units: [], tiles: [] } as unknown as Parameters<typeof suspendSave>[2] extends infer T ? T extends { state: infer S } ? S : never : never;
    const slot = await suspendSave(newState(5), '전투 중', { state: fake, isDefense: true });
    const r = await loadGame(slot);
    expect(r.ok && r.payload.battle?.isDefense).toBe(true);
  });
});
