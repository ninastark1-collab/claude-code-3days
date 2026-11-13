import { useEffect, useRef, useState } from 'react';
import {
  DEVELOP_COST,
  conscript,
  develop,
  relief,
  search,
  train,
  type DevelopKind,
  type Result,
} from '../../engine/commands';
import { cityBase, type Game } from '../../engine/ctx';
import { getRelation, type OfficerState } from '../../engine/state';
import { freeOfficersIn, maxTroops, monthlyGold, neighborsOf, officersIn } from '../../engine/world';
import { Bar, Btn, InlinePanel, Seal, fmt, useGame } from '../common';
import { useSettings } from '../settings';
import { useStore } from '../store';
import { CITY_HANZI } from '../theme';
import { CAN_3D } from '../render3d/support';
import { CommandDialog, type CommandKey } from './Commands';

/** 인장 명령 6종 (政 軍 人 外 計 報) */
type Cat = '政' | '軍' | '人' | '外' | '計' | '報';
const CATS: { hz: Cat; label: string; subs: { key: CommandKey; label: string }[] }[] = [
  {
    hz: '政',
    label: '내정',
    subs: [
      { key: 'agriculture', label: '개간' },
      { key: 'commerce', label: '상업' },
      { key: 'walls', label: '성벽' },
      { key: 'order', label: '치안' },
      { key: 'relief', label: '배급' },
      { key: 'search', label: '탐색' },
    ],
  },
  {
    hz: '軍',
    label: '군사',
    subs: [
      { key: 'conscript', label: '징병' },
      { key: 'train', label: '훈련' },
      { key: 'attack', label: '출진' },
      { key: 'troops', label: '병력 분배' },
      { key: 'transport', label: '수송' },
    ],
  },
  {
    hz: '人',
    label: '인사',
    subs: [
      { key: 'recruit', label: '등용' },
      { key: 'search', label: '인재 탐색' },
      { key: 'reward', label: '포상' },
      { key: 'move', label: '이동' },
      { key: 'governor', label: '태수' },
      { key: 'captive', label: '포로' },
    ],
  },
  { hz: '外', label: '외교', subs: [] },
  {
    hz: '計',
    label: '계략',
    subs: [
      { key: 'rumor', label: '유언비어' },
      { key: 'discord', label: '이간' },
    ],
  },
  { hz: '報', label: '정보', subs: [] },
];

type SimpleKey = DevelopKind | 'relief' | 'search' | 'conscript' | 'train';
const SIMPLE: SimpleKey[] = ['agriculture', 'commerce', 'walls', 'order', 'relief', 'search', 'conscript', 'train'];
type Stat = 'leadership' | 'war' | 'intelligence' | 'politics' | 'charisma';
const STAT_OF: Record<SimpleKey, Stat> = {
  agriculture: 'politics', commerce: 'politics', walls: 'leadership', order: 'war', relief: 'charisma', search: 'intelligence', conscript: 'charisma', train: 'leadership',
};
const STAT_LABEL: Record<Stat, string> = { leadership: '통솔', war: '무력', intelligence: '지력', politics: '정치', charisma: '매력' };
const RUN: Record<SimpleKey, (g: Game, id: string) => Result> = {
  agriculture: (g, id) => develop(g, id, 'agriculture'),
  commerce: (g, id) => develop(g, id, 'commerce'),
  walls: (g, id) => develop(g, id, 'walls'),
  order: (g, id) => develop(g, id, 'order'),
  relief, search, conscript, train,
};

/** 무장 줄에 함께 보여 줄 현재 상태 (징병·훈련은 병력/훈련도가 핵심) */
function currentLine(g: Game, key: SimpleKey, o: OfficerState): string | null {
  if (key === 'conscript') return `병력 ${fmt(o.troops)} / ${fmt(maxTroops(g, o.id))}`;
  if (key === 'train') return o.troops > 0 ? `훈련 ${o.training} / 100 · 병력 ${fmt(o.troops)}` : '병사 없음';
  return null;
}

/** 실행 후 값 (징병: 병력, 훈련: 훈련도) */
function afterLine(key: SimpleKey, o: OfficerState, v: number): string | null {
  if (key === 'conscript') return v > 0 ? `→ ${fmt(o.troops + v)}` : null;
  if (key === 'train') return v > 0 ? `→ ${o.training + v}` : null;
  return null;
}

/** 예상 효과 (S06): 엔진 공식의 무작위 부분을 평균값으로 둔 미리보기 */
function estimate(g: Game, key: SimpleKey, o: OfficerState): { label: string; value: number; cost: number } {
  const b = g.ix.officer.get(o.id)!;
  const c = g.s.cities[o.city]!;
  const cb = cityBase(g, o.city);
  const skill = (s: string) => (b.skills as string[]).includes(s);
  switch (key) {
    case 'agriculture':
    case 'commerce': {
      const room = (key === 'agriculture' ? cb.maxAgriculture : cb.maxCommerce) - c[key];
      const v = Math.min(room, Math.round((b.politics / 6 + 3) * (skill(key) ? 1.3 : 1)));
      return { label: `+${v}`, value: v, cost: DEVELOP_COST[key] };
    }
    case 'walls': {
      const v = Math.min(cb.maxWalls - c.walls, Math.round(((b.leadership + b.politics) / 12 + 3) * (skill('siege') ? 1.3 : 1)));
      return { label: `+${v}`, value: v, cost: DEVELOP_COST.walls };
    }
    case 'order': {
      const v = Math.min(100 - c.order, Math.round((b.war + b.leadership) / 25 + 2.5));
      return { label: `+${v}`, value: v, cost: DEVELOP_COST.order };
    }
    case 'relief': {
      const v = Math.min(100 - c.support, Math.round(b.charisma / 12 + 2.5));
      return { label: `민심 +${v}`, value: v, cost: 0 };
    }
    case 'search': {
      const hidden = freeOfficersIn(g, o.city).filter((f) => !f.found).length;
      const v = Math.round(Math.min(95, 35 + b.intelligence / 3 + (skill('recruit') ? 15 : 0)));
      return hidden ? { label: `발견 ${v}%`, value: v, cost: 0 } : { label: '자금만', value: 1, cost: 0 };
    }
    case 'conscript': {
      const room = maxTroops(g, o.id) - o.troops;
      const v = Math.max(0, Math.min(room, Math.round((b.charisma * 40 + c.support * 20 + 500) / 100) * 100, Math.floor(c.population * 0.03)));
      return { label: `+${fmt(v)}`, value: v, cost: Math.round(v / 10) };
    }
    case 'train': {
      const v = o.troops > 0 ? Math.min(100 - o.training, Math.round(b.leadership / 9 + 2.5)) : 0;
      return { label: `+${v}`, value: v, cost: 0 };
    }
  }
}

/** 인장을 눌렀을 때 기본으로 열 하위 명령: 내정은 가장 모자란 항목 */
function defaultSub(g: Game, cityId: string, cat: Cat): CommandKey {
  if (cat === '政') {
    const c = g.s.cities[cityId]!;
    const cb = cityBase(g, cityId);
    const ratios: [CommandKey, number][] = [
      ['agriculture', c.agriculture / cb.maxAgriculture],
      ['commerce', c.commerce / cb.maxCommerce],
      ['order', c.order / 100],
      ['walls', c.walls / cb.maxWalls],
    ];
    return ratios.sort((a, b) => a[1] - b[1])[0]![0];
  }
  return CATS.find((c) => c.hz === cat)!.subs[0]!.key;
}

/** S05 도시 시트 → S06 장수 선택. 도시 → 인장 → (장수) 세 번 눌러 끝난다 */
export function CitySheet({ cityId, onClose }: { cityId: string; onClose: () => void }) {
  const g = useGame();
  const { open } = useStore();
  const showHanja = useSettings((s) => s.showHanja);
  const [page, setPage] = useState<{ cat: Cat; sub: CommandKey } | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const c = g.s.cities[cityId]!;
  const cb = cityBase(g, cityId);
  const me = g.s.playerFaction;
  const mine = c.faction === me;
  const f = c.faction ? g.s.factions[c.faction] : null;
  const here = c.faction ? officersIn(g, cityId, c.faction) : [];
  const intel = mine || neighborsOf(g, cityId).some((n) => g.s.cities[n.to]?.faction === me);
  const free = freeOfficersIn(g, cityId, true);
  const advisor = [...here].sort((a, b) => g.ix.officer.get(b.id)!.intelligence - g.ix.officer.get(a.id)!.intelligence)[0];
  const rel = c.faction && !mine ? getRelation(g.s, me, c.faction) : null;

  const tapCat = (cat: Cat) => {
    if (cat === '外') return open({ kind: 'diplomacy', city: mine ? cityId : undefined });
    // 3D: 내 도시의 내정은 3D 도시 화면에서 (명령 결과가 도시에서 벌어진다)
    if (cat === '政' && mine && CAN_3D) return open({ kind: 'city3d', id: cityId });
    if (cat === '報') return open({ kind: 'officers', city: cityId });
    setPage({ cat, sub: defaultSub(g, cityId, cat) });
  };

  // 시트 안쪽에서 오른쪽으로 쓸면 닫힘 (화면 가장자리 쓸기는 안드로이드 뒤로 제스처와 겹쳐서 쓰지 않음)
  const swipeHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      swipe.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = swipe.current;
      swipe.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      if (dx > 80 && Math.abs(e.clientY - s.y) < 60) (page ? setPage(null) : onClose());
    },
  };

  const back = () => (page ? setPage(null) : onClose());
  const cat = page ? CATS.find((x) => x.hz === page.cat)! : null;

  return (
    <aside className="sheet" {...swipeHandlers} aria-label={`${cb.name} 도시 시트`}>
      <span className="grab" />
      {!page ? (
        <>
          <div className="sheet-head">
            <div>
              <div className="crumb">
                {cb.region} · {f?.name ?? '공백지'}
              </div>
              <div className="ttl">
                {cb.name} {showHanja && CITY_HANZI[cityId] && <small>{CITY_HANZI[cityId]}</small>}
              </div>
              <div className="dim small" style={{ marginTop: 2 }}>
                {c.governor ? `태수 ${g.ix.officer.get(c.governor)!.name}` : '태수 없음'}
                {advisor && mine ? ` · 군사 ${g.ix.officer.get(advisor.id)!.name}` : ''}
                {rel ? ` · ${rel.treaty === 'alliance' ? '동맹' : rel.treaty === 'truce' ? '정전' : '우호'} ${rel.friendship}` : ''}
              </div>
            </div>
            <button className="back" onClick={back} aria-label="닫기">
              ✕
            </button>
          </div>
          <div className="sheet-body scroll">
          {intel ? (
            <>
              <div className="trio">
                <div>
                  <span>병력</span>
                  <b>{fmt(here.reduce((s, o) => s + o.troops, 0))}</b>
                </div>
                <div>
                  <span>병량</span>
                  <b>{fmt(c.food)}</b>
                </div>
                <div>
                  <span>금</span>
                  <b>{fmt(c.gold)}</b>
                </div>
              </div>
              <div className="bars">
                <div className="lbl">
                  <span>내정</span>
                  <span>이번 달 +{fmt(monthlyGold(c))} 금</span>
                </div>
                <Row label="민심" v={c.support} max={100} tone={c.support >= 60 ? 'good' : c.support >= 40 ? 'warn' : 'bad'} />
                <Row label="치안" v={c.order} max={100} tone={c.order >= 60 ? 'good' : c.order >= 40 ? 'warn' : 'bad'} />
                <Row label="농업" v={c.agriculture} max={cb.maxAgriculture} />
                <Row label="상업" v={c.commerce} max={cb.maxCommerce} />
                <Row label="성벽" v={c.walls} max={cb.maxWalls} />
              </div>
              <div className="lbl">
                <span>무장 {here.length}</span>
                {mine && <span>행동 가능 {here.filter((o) => !o.acted).length}</span>}
              </div>
              <div className="offs">
                {here.map((o) => (
                  <button key={o.id} className={`off ${o.acted && mine ? 'done' : ''}`} onClick={() => open({ kind: 'officer', id: o.id })}>
                    <Seal id={o.id} name={g.ix.officer.get(o.id)!.name} faction={o.faction} />
                    {g.ix.officer.get(o.id)!.name}
                  </button>
                ))}
                {free.map((o) => (
                  <button key={o.id} className="off free" onClick={() => open({ kind: 'officer', id: o.id })} title="재야">
                    <Seal id={o.id} name={g.ix.officer.get(o.id)!.name} faction={null} />
                    {g.ix.officer.get(o.id)!.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="dim small">멀리 떨어진 도시라 자세한 사정을 알 수 없다.</p>
          )}
          </div>
          <div className="cmds">
            {CATS.map((ct, i) => {
              const enabled = mine || ((ct.hz === '外' || ct.hz === '計') && !!c.faction && c.faction !== me);
              return (
                <button key={ct.hz} className="cmd" disabled={!enabled} onClick={() => tapCat(ct.hz)} title={ct.label}>
                  <kbd>{i + 1}</kbd>
                  <b>{ct.hz}</b>
                  <span>{ct.label}</span>
                </button>
              );
            })}
          </div>
          <NumberKeys onKey={(n) => CATS[n] && (mine || CATS[n]!.hz === '外') && tapCat(CATS[n]!.hz)} />
        </>
      ) : (
        <>
          <div className="sheet-head">
            <div className="crumb">
              <button onClick={() => setPage(null)}>{cb.name}</button> › {cat!.label} › <b>{cat!.subs.find((s) => s.key === page.sub)?.label}</b>
            </div>
            <button className="back" onClick={back} aria-label="뒤로">
              ←
            </button>
          </div>
          {cat!.subs.length > 1 && (
            <div className="subtabs">
              {cat!.subs.map((s) => (
                <button key={s.key} className={s.key === page.sub ? 'on' : ''} onClick={() => setPage({ cat: page.cat, sub: s.key })}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {SIMPLE.includes(page.sub as SimpleKey) ? (
            <OfficerPick key={page.sub} cityId={cityId} cmd={page.sub as SimpleKey} label={cat!.subs.find((s) => s.key === page.sub)!.label} onDone={() => setPage(null)} />
          ) : (
            <InlinePanel.Provider value>
              <CommandDialog key={page.sub} cmd={page.sub} cityId={cityId} onClose={() => setPage(null)} />
            </InlinePanel.Provider>
          )}
        </>
      )}
    </aside>
  );
}

/** 탐색 안내: 이 도시에 발견한 재야 무장과, 아직 숨은 인재가 있다는 소문 */
function SearchHint({ g, cityId }: { g: Game; cityId: string }) {
  const all = freeOfficersIn(g, cityId);
  const found = all.filter((f) => f.found);
  const hidden = all.length - found.length;
  return (
    <span>
      재야 발견 <b className="num">{found.length}</b>명
      {found.length > 0 && ` (${found.map((f) => g.ix.officer.get(f.id)!.name).slice(0, 3).join('·')}${found.length > 3 ? '…' : ''} → 인사·등용)`} ·{' '}
      {hidden > 0 ? <b>숨은 인재가 있다는 소문</b> : '숨은 인재 소문 없음 (자금만 찾을 수 있음)'}
    </span>
  );
}

function Row({ label, v, max, tone }: { label: string; v: number; max: number; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <Bar value={v} max={max} tone={tone} />
      <span>{max === 100 ? v : `${v}/${max}`}</span>
    </div>
  );
}

/** 숫자키 1~6 = 명령 인장 (PC 보너스) */
function NumberKeys({ onKey }: { onKey: (n: number) => void }) {
  const ref = useRef(onKey);
  ref.current = onKey;
  useStoreKey((e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 6) ref.current(n - 1);
  });
  return null;
}

function useStoreKey(fn: (e: KeyboardEvent) => void) {
  useEffect(() => {
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  });
}

/**
 * S06 명령 → 장수 선택. 예상 효과를 보여 주고 가장 나은 장수에 "추천". 추천 장수가 미리 골라져 있어 바로 맡길 수 있다.
 * 여러 명을 골라 한 번에 맡길 수도 있다.
 */
function OfficerPick({ cityId, cmd, label, onDone }: { cityId: string; cmd: SimpleKey; label: string; onDone: () => void }) {
  const g = useGame();
  const run = useStore((s) => s.run);
  const me = g.s.playerFaction;
  const stat = STAT_OF[cmd];
  const list = officersIn(g, cityId, me)
    .map((o) => ({ o, b: g.ix.officer.get(o.id)!, e: estimate(g, cmd, o) }))
    .sort((a, b) => b.b[stat] - a.b[stat]);
  const best = list.filter((x) => !x.o.acted && x.e.value > 0).sort((a, b) => b.e.value - a.e.value)[0];
  const [sel, setSel] = useState<string[]>(best ? [best.o.id] : []);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const cost = list.filter((x) => sel.includes(x.o.id)).reduce((s, x) => s + x.e.cost, 0);
  const go = () => {
    const r = run((gg) => {
      let n = 0;
      const fails: string[] = [];
      const msgs: string[] = [];
      for (const id of sel) {
        const res = RUN[cmd](gg, id);
        if (res.ok) {
          n++;
          msgs.push(res.msg);
        } else fails.push(`${gg.ix.officer.get(id)!.name}: ${res.msg}`);
      }
      return { ok: n > 0, msg: n === 1 && !fails.length ? msgs[0]! : [`${label}: ${n}명 실행${fails.length ? `, ${fails.length}명 실패` : ''}`, ...fails.slice(0, 1)].join(' · ') };
    });
    if (r.ok) onDone();
  };
  const idle = list.filter((x) => !x.o.acted);
  const c = g.s.cities[cityId]!;
  const left = c.gold - cost;
  const selected = list.filter((x) => sel.includes(x.o.id));
  const gainSum = selected.reduce((s, x) => s + x.e.value, 0);
  return (
    <>
      <div className="ttl" style={{ fontSize: 'var(--fs-h2)' }}>
        누구에게 맡기겠습니까
      </div>
      {/* 도시 자원: 지금 얼마 있고, 이 명령에 얼마 들고, 얼마 남는지 */}
      <div className="cmd-funds small" aria-label="도시 자원">
        <span>
          금 <b className="num">{fmt(c.gold)}</b>
          {cost > 0 && (
            <>
              {' '}
              − <b className="num">{fmt(cost)}</b> → <b className={`num ${left < 0 ? 'bad' : ''}`}>{fmt(left)}</b>
            </>
          )}
        </span>
        {cmd === 'conscript' && (
          <span>
            인구 <b className="num">{fmt(c.population)}</b>
            {gainSum > 0 && <> → {fmt(c.population - gainSum)}</>} · 민심 {c.support}
            {gainSum > 0 && <> → {Math.max(0, c.support - selected.reduce((s, x) => s + Math.ceil(x.e.value / 1500), 0))}</>}
          </span>
        )}
        {cmd === 'relief' && <span>병량 <b className="num">{fmt(c.food)}</b> · 1회 {fmt(Math.max(500, Math.round(c.population / 200)))} 소모</span>}
        {cmd === 'search' && <SearchHint g={g} cityId={cityId} />}
        {cmd !== 'conscript' && cmd !== 'relief' && cmd !== 'search' && <span>병량 <b className="num">{fmt(c.food)}</b></span>}
      </div>
      {left < 0 && <div className="bad small">금이 {fmt(-left)} 모자랍니다. 일부 무장은 실패합니다.</div>}
      <div className="pick-head">
        <span>무장</span>
        <span>{STAT_LABEL[stat]} ▼</span>
        <span>예상</span>
      </div>
      <div className="pick-list scroll">
        {list.map(({ o, b, e }) => {
          const cur = currentLine(g, cmd, o);
          const after = o.acted ? null : afterLine(cmd, o, e.value);
          return (
            <button key={o.id} className={`pick ${sel.includes(o.id) ? 'sel' : ''} ${o.acted ? 'disabled' : ''}`} disabled={o.acted} onClick={() => toggle(o.id)}>
              <span className="who">
                <Seal id={o.id} name={b.name} faction={o.faction} size={26} />
                <span>
                  {b.name}
                  {best?.o.id === o.id && <span className="rec">추천</span>}
                  {o.acted && <span className="done-tag">행동완료</span>}
                  {cur && <span className="pick-cur">{cur}</span>}
                </span>
              </span>
              <span className="v">{b[stat]}</span>
              <span className="eff">
                {o.acted ? '' : e.label}
                {after && <span className="pick-after">{after}</span>}
                {!o.acted && e.cost > 0 && <span className="pick-cost">금 {fmt(e.cost)}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="panel-foot" style={{ marginTop: 'auto' }}>
        <Btn small onClick={() => setSel(sel.length === idle.length ? [] : idle.map((x) => x.o.id))} disabled={!idle.length}>
          {sel.length === idle.length && idle.length ? '선택 해제' : '전원 선택'}
        </Btn>
        <Btn kind="primary" disabled={!sel.length} onClick={go} style={{ flex: 1 }}>
          {sel.length === 1 ? `${g.ix.officer.get(sel[0]!)!.name}에게 맡긴다` : `${sel.length}명에게 맡긴다`}
          {cost > 0 ? ` · 금 ${fmt(cost)}` : ''}
        </Btn>
      </div>
    </>
  );
}
