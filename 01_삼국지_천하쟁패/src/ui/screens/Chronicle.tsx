import { useState } from 'react';
import { campOf, eraLabel } from '../../data/eras';
import { useGame } from '../common';
import { useStore } from '../store';

const WAR = /점령|방어|전사|사로잡|멸망|함락|공격|항복/;
const PERSON = /합류|떠남|병사|즉위|뒤를 이음|처형|출사|계승|독립/;

/**
 * S16 연대기: 게임 속 사건을 연호와 함께 한지 위에 쌓는다.
 * 역사와 달라진 일(〔if〕)은 엔진이 따로 판정하지 않아서 표시하지 않는다.
 */
export function ChronicleScreen() {
  const g = useGame();
  const open = useStore((s) => s.open);
  const [filter, setFilter] = useState<'all' | 'war' | 'person'>('all');
  const f = g.s.factions[g.s.playerFaction]!;
  const camp = campOf(f.id, f.ruler);
  const rows = [...g.s.log]
    .reverse()
    .filter((l) => (filter === 'war' ? WAR.test(l.text) : filter === 'person' ? PERSON.test(l.text) : true));
  let lastDate = '';
  return (
    <div className="screen paper" style={{ zIndex: 30 }}>
      <div className="abs" style={{ left: 'var(--sa)', top: 10, right: 'var(--sa)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="disp" style={{ fontSize: 24 }}>
          연대기 <span className="hz dim" style={{ fontSize: 14, fontWeight: 600 }}>年代記</span>
        </span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {(
            [
              ['all', '전체'],
              ['war', '전쟁'],
              ['person', '인물'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
          <button className="back" style={{ color: 'var(--g-ink)', borderColor: 'var(--g-paper-ink)' }} onClick={() => open(null)} aria-label="닫기">
            ✕
          </button>
        </span>
      </div>
      <div className="abs scroll" style={{ left: 'var(--sa)', right: 'var(--sa)', top: 58, bottom: 10, display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 18px', alignContent: 'start' }}>
        {rows.map((l, i) => {
          const [y, m] = l.date.split('.').map(Number) as [number, number];
          const head = l.date !== lastDate;
          lastDate = l.date;
          return (
            <div key={i} style={{ display: 'contents' }}>
              <div style={{ borderTop: head ? '1px solid var(--g-paper-ink)' : 'none', paddingTop: 6 }}>
                {head && (
                  <>
                    <div className="disp" style={{ fontSize: 16 }}>
                      {eraLabel(y, camp)}
                    </div>
                    <div className="dim micro">
                      {m}월 · {y}년
                    </div>
                  </>
                )}
              </div>
              <div className="disp" style={{ borderTop: head ? '1px solid var(--g-paper-ink)' : 'none', paddingTop: 6, fontSize: 16, lineHeight: 1.55 }}>
                {l.text}
              </div>
            </div>
          );
        })}
        {!rows.length && <p className="dim">아직 기록된 일이 없다.</p>}
      </div>
    </div>
  );
}
