import { useState } from 'react';
import { getRelation } from '../../engine/state';
import { armyPower, canAttack, cityDefense, maxTroops, neighborsOf, officersIn } from '../../engine/world';
import { Bar, Btn, Portrait, SKILL_NAME, fmt, fmtK, useGame } from '../common';
import { useSettings } from '../settings';
import { useStore } from '../store';
import { factionBackground, sealChar } from '../theme';

type Stat = 'leadership' | 'war' | 'intelligence' | 'politics' | 'charisma';
const STATS: [Stat, string][] = [
  ['leadership', '통솔'],
  ['war', '무력'],
  ['intelligence', '지력'],
  ['politics', '정치'],
  ['charisma', '매력'],
];

/** 오버레이 공통 틀: 위쪽 띠 아래를 덮는다 */
function OverlayFrame({ children, paper }: { children: React.ReactNode; paper?: boolean }) {
  return (
    <div className={`screen ${paper ? 'paper' : ''}`} style={{ top: 42, zIndex: 9, background: paper ? undefined : 'var(--g-lacquer-solid)' }}>
      {children}
    </div>
  );
}

/** S08 무장 목록: 도시별 거르기, 머리글 정렬, 한 줄 44pt, 숫자는 막대와 함께 */
export function OfficerListScreen({ city }: { city?: string }) {
  const g = useGame();
  const open = useStore((s) => s.open);
  const me = g.s.playerFaction;
  const [filter, setFilter] = useState<string>(city ?? 'all');
  const [sort, setSort] = useState<Stat | 'loyalty'>('war');
  const mine = Object.values(g.s.officers).filter((o) => o.status === 'serving' && o.faction === me);
  const myCities = g.ix.data.cities.filter((c) => g.s.cities[c.id]!.faction === me);
  const free = Object.values(g.s.officers).filter((o) => o.status === 'free' && o.found && g.s.cities[o.city]?.faction === me);
  const caps = Object.values(g.s.officers).filter((o) => o.status === 'captive' && o.captor === me);
  const list = (filter === 'all' ? mine : filter === 'free' ? free : filter === 'cap' ? caps : mine.filter((o) => o.city === filter)).slice();
  list.sort((a, b) => (sort === 'loyalty' ? a.loyalty - b.loyalty : g.ix.officer.get(b.id)![sort] - g.ix.officer.get(a.id)![sort]));
  const ruler = g.s.factions[me]!.ruler;
  return (
    <OverlayFrame>
      <div className="abs" style={{ left: 'var(--sa)', right: 'var(--sa)', top: 8, bottom: 0, display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div className="tabs scroll" style={{ border: 0, overflowX: 'auto', touchAction: 'pan-x' }}>
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              전체 {mine.length}
            </button>
            {myCities.map((c) => (
              <button key={c.id} className={filter === c.id ? 'on' : ''} onClick={() => setFilter(c.id)}>
                {c.name} {mine.filter((o) => o.city === c.id).length}
              </button>
            ))}
            <button className={filter === 'free' ? 'on' : ''} onClick={() => setFilter('free')}>
              재야 {free.length}
            </button>
            <button className={filter === 'cap' ? 'on' : ''} onClick={() => setFilter('cap')}>
              포로 {caps.length}
            </button>
          </div>
          <button className="back" onClick={() => open(null)} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="olist-head">
          <span>무장</span>
          <span>도시</span>
          {STATS.map(([k, l]) => (
            <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>
              {l}
              {sort === k ? ' ▼' : ''}
            </button>
          ))}
          <button className={sort === 'loyalty' ? 'on' : ''} onClick={() => setSort('loyalty')}>
            충성{sort === 'loyalty' ? ' ▲' : ''}
          </button>
          <span>임무</span>
        </div>
        <div className="scroll" style={{ display: 'grid', gap: 3, alignContent: 'start' }}>
          {list.map((o) => {
            const b = g.ix.officer.get(o.id)!;
            const top = Math.max(b.leadership, b.war, b.intelligence, b.politics, b.charisma);
            return (
              <div key={o.id} className="olist-row" onClick={() => open({ kind: 'officer', id: o.id, back: { kind: 'officers', city: filter === 'all' ? undefined : filter } })}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Portrait officerId={o.id} name={b.name} faction={o.status === 'serving' ? o.faction : null} size={30} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span className="disp" style={{ fontSize: 'var(--fs-lead)' }}>
                      {b.name}
                    </span>{' '}
                    <span className="dim micro">{b.courtesy}</span>
                  </span>
                </span>
                <span className="dim small">{g.ix.city.get(o.city)?.name}</span>
                {STATS.map(([k]) => (
                  <span key={k} className={`stat ${b[k] >= 90 ? 'hi' : ''}`}>
                    <b>{b[k]}</b>
                    <span className="trk">
                      <i style={{ width: `${b[k]}%`, opacity: b[k] === top ? 1 : 0.55 }} />
                    </span>
                  </span>
                ))}
                <span className={`num ${o.status === 'serving' && o.id !== ruler && o.loyalty < 70 ? 'bad' : ''}`}>
                  {o.status !== 'serving' || o.id === ruler ? '-' : `${o.loyalty}${o.loyalty < 70 ? ' ▼' : ''}`}
                </span>
                <span className="dim small">{o.status === 'captive' ? '포로' : o.status === 'free' ? '재야' : o.id === ruler ? '군주' : o.acted ? '행동완료' : '대기'}</span>
              </div>
            );
          })}
          {!list.length && <p className="dim">해당하는 무장이 없습니다.</p>}
        </div>
      </div>
    </OverlayFrame>
  );
}

/** S09 무장 상세: 왼쪽 초상, 가운데 능력, 오른쪽 관계·행적 탭 */
export function OfficerDetailScreen({ id }: { id: string }) {
  const g = useGame();
  const { open, overlay, focusCity } = useStore();
  const cb = useSettings((s) => s.colorBlind);
  const [tab, setTab] = useState<'rel' | 'log'>('rel');
  const b = g.ix.officer.get(id)!;
  const o = g.s.officers[id]!;
  const faction = o.status === 'serving' ? o.faction : null;
  const f = faction ? g.s.factions[faction] : null;
  const back = overlay?.kind === 'officer' ? overlay.back ?? null : null;
  const age = g.s.year - b.birthYear;
  const top = Math.max(b.leadership, b.war, b.intelligence, b.politics, b.charisma);
  const rels: string[] = [];
  const byId = (x?: string) => (x ? g.ix.officer.get(x)?.name : undefined);
  if (b.father) rels.push(`부친 · ${byId(b.father)}`);
  const kids = g.ix.data.officers.filter((x) => x.father === id).map((x) => x.name);
  if (kids.length) rels.push(`자녀 · ${kids.join(', ')}`);
  if (b.spouse) rels.push(`배우자 · ${byId(b.spouse)}`);
  const spouseOf = g.ix.data.officers.filter((x) => x.spouse === id).map((x) => x.name);
  if (spouseOf.length) rels.push(`배우자 · ${spouseOf.join(', ')}`);
  if (b.sworn) rels.push(`의형제 · ${g.ix.data.officers.filter((x) => x.sworn === b.sworn && x.id !== id).map((x) => x.name).join(', ')}`);
  const deeds = g.s.log.filter((l) => l.text.includes(b.name));
  const status = o.status === 'serving' ? f?.name : o.status === 'free' ? '재야' : o.status === 'captive' ? `포로 (${g.s.factions[o.captor!]?.name})` : o.status === 'dead' ? '사망' : '미등장';
  return (
    <OverlayFrame>
      <div className="abs" style={{ left: 0, top: 0, bottom: 0, width: 250, background: factionBackground(faction, cb), display: 'grid', placeItems: 'center' }}>
        <div className="portrait-frame">
          <Portrait officerId={id} name={b.name} faction={faction} size={180} gray={o.status === 'dead'} />
        </div>
        <button className="back abs" style={{ left: 'var(--sa)', top: 10, background: 'var(--g-lacquer)' }} onClick={() => open(back)} aria-label="뒤로">
          ←
        </button>
      </div>
      <div className="abs" style={{ left: 268, top: 12, width: 236, display: 'grid', gap: 8 }}>
        <div>
          <div className="disp" style={{ fontSize: 30, lineHeight: 1 }}>
            {b.name} <span className="dim" style={{ fontSize: 16 }}>{b.courtesy}</span>
          </div>
          <div className="hz gold" style={{ fontSize: 13, marginTop: 2, fontWeight: 600 }}>
            {sealChar(id, b.name)} · {g.ix.city.get(b.homeCity ?? '')?.name ?? ''} 출신
          </div>
          <div className="dim small" style={{ marginTop: 2 }}>
            {status} · {g.ix.city.get(o.city)?.name ?? '-'} · {age}세{o.status === 'serving' && f?.ruler !== id ? ` · 충성 ${o.loyalty}` : ''}
          </div>
        </div>
        <div className="bars">
          {STATS.map(([k, l]) => (
            <div key={k} className="bar" style={{ gridTemplateColumns: '30px 1fr 26px' }}>
              <span>{l}</span>
              <Bar value={b[k]} />
              <span className={b[k] === top || b[k] >= 90 ? 'gold' : ''} style={{ fontWeight: 600 }}>
                {b[k]}
              </span>
            </div>
          ))}
        </div>
        <div className="offs">
          {b.skills.map((s) => (
            <span key={s} className="tag" style={{ border: '1px solid var(--g-gold-dim)', background: 'none', color: 'var(--g-text)' }}>
              {SKILL_NAME[s] ?? s}
            </span>
          ))}
        </div>
        {o.status === 'serving' && (
          <div className="dim small num">
            병력 {fmt(o.troops)} / {fmt(maxTroops(g, id))} · 훈련 {o.training}
          </div>
        )}
      </div>
      <div className="abs" style={{ left: 524, right: 'var(--sa)', top: 10, bottom: 68, display: 'grid', gridTemplateRows: 'auto 1fr', gap: 8 }}>
        <div className="tabs">
          <button className={tab === 'rel' ? 'on' : ''} onClick={() => setTab('rel')}>
            관계
          </button>
          <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>
            행적 {deeds.length}
          </button>
        </div>
        <div className="scroll small" style={{ lineHeight: 1.65 }}>
          {tab === 'rel' ? (
            rels.length ? rels.map((r) => <p key={r} style={{ margin: '0 0 4px' }}>{r}</p>) : <p className="dim">기록된 관계가 없다.</p>
          ) : deeds.length ? (
            [...deeds].reverse().map((l, i) => (
              <p key={i} style={{ margin: '0 0 4px' }}>
                <span className="dim num">{l.date}</span> {l.text}
              </p>
            ))
          ) : (
            <p className="dim">이번 판에서 남긴 행적이 아직 없다.</p>
          )}
        </div>
      </div>
      {o.status === 'serving' && o.faction === g.s.playerFaction && (
        <div className="abs" style={{ right: 'var(--sa)', bottom: 14, display: 'flex', gap: 6 }}>
          <Btn kind="primary" style={{ width: 120 }} onClick={() => focusCity(o.city)}>
            임무 주기
          </Btn>
        </div>
      )}
    </OverlayFrame>
  );
}

/** 勢: 내 도시 개요(S18 축소판)와 천하 정세 */
export function FactionsPanel() {
  const g = useGame();
  const { open, focusCity } = useStore();
  const cb = useSettings((s) => s.colorBlind);
  const [tab, setTab] = useState<'mine' | 'world'>('mine');
  const me = g.s.playerFaction;
  const myCities = g.ix.data.cities.filter((c) => g.s.cities[c.id]!.faction === me);
  const threat = (cid: string) =>
    neighborsOf(g, cid).reduce((s, n) => {
      const nc = g.s.cities[n.to]!;
      return nc.faction && nc.faction !== me && canAttack(g, nc.faction, me) ? s + armyPower(g, officersIn(g, n.to, nc.faction)) : s;
    }, 0) / Math.max(1, cityDefense(g, cid));
  const rows = Object.values(g.s.factions)
    .filter((f) => f.alive)
    .map((f) => {
      const os = Object.values(g.s.officers).filter((o) => o.status === 'serving' && o.faction === f.id);
      return { f, cities: Object.values(g.s.cities).filter((c) => c.faction === f.id).length, officers: os.length, troops: os.reduce((s, o) => s + o.troops, 0) };
    })
    .sort((a, b) => b.cities - a.cities || b.troops - a.troops);
  return (
    <aside className="sheet with-top" style={{ width: 430 }}>
      <div className="sheet-head">
        <div className="tabs" style={{ border: 0 }}>
          <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
            내 도시 {myCities.length}
          </button>
          <button className={tab === 'world' ? 'on' : ''} onClick={() => setTab('world')}>
            천하 정세
          </button>
        </div>
        <button className="back" onClick={() => open(null)} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="scroll" style={{ display: 'grid', gap: 3, alignContent: 'start' }}>
        {tab === 'mine'
          ? myCities.map((c) => {
              const cs = g.s.cities[c.id]!;
              const t = threat(c.id);
              return (
                <button key={c.id} className="pick" style={{ gridTemplateColumns: '1fr 70px 60px 56px' }} onClick={() => focusCity(c.id)}>
                  <span className="disp" style={{ fontSize: 'var(--fs-lead)' }}>
                    {c.name}
                  </span>
                  <span className="v">{fmtK(officersIn(g, c.id, me).reduce((s, o) => s + o.troops, 0))}</span>
                  <span className="v">민심 {cs.support}</span>
                  <span className={`v ${t > 1 ? 'bad' : t > 0.6 ? 'warn' : 'good'}`}>위협 {t > 1 ? '高' : t > 0.6 ? '中' : '低'}</span>
                </button>
              );
            })
          : rows.map(({ f, cities, officers, troops }) => {
              const rel = f.id === me ? null : getRelation(g.s, me, f.id);
              return (
                <div key={f.id} className="pick" style={{ gridTemplateColumns: '1fr 44px 44px 60px 60px', cursor: 'default' }}>
                  <span className="who">
                    <i className="sl" style={{ width: 20, height: 20, background: factionBackground(f.id, cb) }} />
                    <span>{f.name}</span>
                  </span>
                  <span className="v">{cities}</span>
                  <span className="v">{officers}</span>
                  <span className="v">{fmtK(troops)}</span>
                  <span className="v dim">{rel ? (rel.treaty === 'alliance' ? '동맹' : rel.treaty === 'truce' ? '정전' : `우호 ${rel.friendship}`) : '아군'}</span>
                </div>
              );
            })}
      </div>
    </aside>
  );
}
