import { useMemo, useState } from 'react';
import { eraLabel } from '../../data/eras';
import { DIFFICULTY_NAME, type Difficulty } from '../../engine/state';
import { Btn, Portrait, Seal, fmtK } from '../common';
import { InkCanvas } from '../components/Ink';
import { MapCanvas, type MapCity } from '../map/MapCanvas';
import { useSettings } from '../settings';
import { useStore } from '../store';

const SUBTITLE: Record<string, string> = {
  s184: '영웅들의 시작',
  s190: '열여덟 제후가 낙양으로',
  s194: '서주를 둘러싼 각축',
  s200: '조조 대 원소',
  s208: '손유 연합의 화공',
  s219: '관우, 형주에서 북상',
};

/** S02 시나리오 선택: 왼쪽 연표에서 고르면 오른쪽 지도가 그 해의 세력도로 바뀐다 */
export function ScenarioScreen() {
  const { data, go, pickScenario } = useStore();
  const colorBlind = useSettings((s) => s.colorBlind);
  const list = [...data.scenarios].sort((a, b) => a.year - b.year);
  const [id, setId] = useState(useStore.getState().scenarioId);
  const sc = data.scenarios.find((s) => s.id === id)!;
  const owner = new Map(sc.cities.map((c) => [c.city, c.faction]));
  const cities: MapCity[] = data.cities.map((c) => ({ id: c.id, name: c.name, faction: owner.get(c.id) ?? null }));
  return (
    <div className="screen">
      {/* 지도는 왼쪽 연표(330) 오른쪽 공간 가운데에 오도록 중심을 옮긴다 */}
      <MapCanvas key={id} cities={cities} roads={data.roads} colorBlind={colorBlind} initialK={17} focus={{ city: 'wan', nonce: 1 }} rightInset={-330} interactive={false} />
      <div className="abs" style={{ left: 0, top: 0, bottom: 0, width: 330, padding: '16px 16px 16px var(--sa)', background: 'var(--g-lacquer)', borderRight: '1px solid var(--g-gold-dim)', display: 'grid', gap: 5, alignContent: 'start' }}>
        <div className="lbl" style={{ marginBottom: 4 }}>
          <span>시나리오</span>
          <span>{list.length}개</span>
        </div>
        {list.map((s) => (
          <button
            key={s.id}
            className="pick"
            style={{ gridTemplateColumns: '44px 1fr', gap: 8, background: s.id === id ? 'var(--g-lacquer-3)' : 'transparent', boxShadow: s.id === id ? 'inset 3px 0 0 var(--g-gold)' : 'none' }}
            onClick={() => setId(s.id)}
          >
            <span className="num" style={{ fontWeight: 600, color: s.id === id ? 'var(--g-gold)' : 'var(--g-text-dim)' }}>
              {s.year}
            </span>
            <span>
              <span className="disp" style={{ fontSize: 15 }}>
                {s.name}
              </span>
              <br />
              <span className="dim micro">{SUBTITLE[s.id] ?? eraLabel(s.year)}</span>
            </span>
          </button>
        ))}
        <Btn small style={{ marginTop: 8 }} onClick={() => go('title')}>
          ← 타이틀
        </Btn>
      </div>
      <div className="abs" style={{ right: 'var(--sa)', top: 16, width: 260, padding: '12px 14px', background: 'var(--g-lacquer)', border: '1px solid var(--g-gold-dim)', borderRadius: 4 }}>
        <div className="disp" style={{ fontSize: 20 }}>
          {sc.year} · {sc.name}
        </div>
        <div className="gold small">{eraLabel(sc.year)}</div>
        <p className="dim small" style={{ margin: '4px 0 0', lineHeight: 1.55 }}>
          {sc.description}
        </p>
        <div className="lbl" style={{ marginTop: 8 }}>
          <span>세력 {sc.factions.length}</span>
          <span>도시 {data.cities.length}</span>
        </div>
      </div>
      <Btn kind="primary" className="abs" style={{ right: 'var(--sa)', bottom: 14, width: 160, height: 52 }} onClick={() => pickScenario(id)}>
        군주 선택 →
      </Btn>
    </div>
  );
}

/** S03 군주 선택: 카드를 옆으로 밀어 보고, 오른쪽에 그 군주로 무엇을 할 수 있는지 한 줄로 */
export function LordScreen() {
  const { data, go, newGame, scenarioId } = useStore();
  const sc = data.scenarios.find((s) => s.id === scenarioId)!;
  const officerById = useMemo(() => new Map(data.officers.map((o) => [o.id, o])), [data]);
  const rows = sc.factions
    .map((f) => {
      const officers = sc.officers.filter((o) => o.faction === f.id);
      return {
        f,
        officers,
        cities: sc.cities.filter((c) => c.faction === f.id).length,
        troops: officers.reduce((s, o) => s + o.troops, 0),
      };
    })
    .sort((a, b) => b.troops - a.troops);
  const level = (i: number) => tierOf(i, rows.length);
  const [pick, setPick] = useState(rows.find((r) => r.f.id === 'liu_bei')?.f.id ?? rows[0]!.f.id);
  const [historical, setHistorical] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const chosen = rows.find((r) => r.f.id === pick)!;
  const ruler = officerById.get(chosen.f.ruler)!;
  const stars = chosen.officers
    .map((o) => officerById.get(o.officer)!)
    .filter((o) => o.id !== ruler.id)
    .sort((a, b) => b.leadership + b.war + b.intelligence - (a.leadership + a.war + a.intelligence))
    .slice(0, 6);
  return (
    <div className="screen">
      <InkCanvas seed={9} />
      <div className="abs" style={{ left: 'var(--sa)', top: 14, right: 'var(--sa)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="disp" style={{ fontSize: 20 }}>
          군주를 고르십시오
        </span>
        <span className="dim small">
          {sc.year} · {sc.name} · 옆으로 밀어 더 보기
        </span>
      </div>
      <div className="abs scroll" style={{ left: 'var(--sa)', top: 48, right: 270, display: 'flex', gap: 10, overflowX: 'auto', overflowY: 'hidden', touchAction: 'pan-x', paddingBottom: 8 }}>
        {rows.map((r, i) => {
          const o = officerById.get(r.f.ruler)!;
          const on = r.f.id === pick;
          return (
            <button
              key={r.f.id}
              onClick={() => setPick(r.f.id)}
              style={{
                width: 112, height: 236, flex: 'none', border: `1px solid ${on ? 'var(--g-gold)' : 'var(--g-gold-dim)'}`, borderRadius: 4, overflow: 'hidden',
                display: 'grid', gridTemplateRows: '1fr auto', padding: 0, background: 'var(--g-lacquer-solid)', cursor: 'pointer',
                boxShadow: on ? '0 0 0 2px var(--g-gold)' : 'none', opacity: on ? 1 : 0.8,
              }}
            >
              <Portrait officerId={o.id} name={o.name} faction={r.f.id} size={110} age={sc.year - o.birthYear} />
              <span style={{ padding: '6px 10px', textAlign: 'left' }}>
                <span className="disp" style={{ fontSize: 17, display: 'block' }}>
                  {o.name}
                </span>
                <span className="dim micro">
                  {r.f.name} · {level(i)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="abs" style={{ right: 'var(--sa)', top: 48, width: 210, display: 'grid', gap: 7, fontSize: 'var(--fs-small)' }}>
        <div className="disp" style={{ fontSize: 22 }}>
          {ruler.name} {ruler.courtesy}
        </div>
        <div className="dim">
          도시 {chosen.cities} · 무장 {chosen.officers.length} · 병력 {fmtK(chosen.troops)}
        </div>
        <p style={{ margin: 0, lineHeight: 1.55 }}>
          {chosen.cities <= 1 ? '근거지가 하나뿐이다. 이웃의 틈을 노려 살아남아라.' : chosen.cities >= 5 ? '땅이 넓다. 사방을 지키며 천하를 노려라.' : '이웃 군웅과 다투며 세력을 키워라.'}
        </p>
        <div className="lbl">
          <span>주요 무장</span>
        </div>
        <div className="offs">
          {stars.map((o) => (
            <Seal key={o.id} id={o.id} name={o.name} faction={pick} size={24} />
          ))}
        </div>
        <div className="lbl" style={{ marginTop: 4 }}>
          <span>게임 난이도</span>
        </div>
        <div className="seg">
          {(Object.keys(DIFFICULTY_NAME) as Difficulty[]).map((d) => (
            <button key={d} className={difficulty === d ? 'on' : ''} onClick={() => setDifficulty(d)}>
              {DIFFICULTY_NAME[d]}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 34, cursor: 'pointer' }}>
          <button className={`toggle ${historical ? 'on' : ''}`} role="switch" aria-checked={historical} onClick={() => setHistorical(!historical)} />
          역사 이벤트
        </label>
      </div>
      <Btn small className="abs" style={{ left: 'var(--sa)', bottom: 14 }} onClick={() => go('newgame')}>
        ← 시나리오
      </Btn>
      <Btn kind="primary" className="abs" style={{ right: 'var(--sa)', bottom: 14, width: 210, height: 52 }} onClick={() => newGame(scenarioId, pick, historical, difficulty)}>
        이 군주로 시작
      </Btn>
    </div>
  );
}

/**
 * 군주 카드의 체급 (QA-DSN-02): 병력 순위 3등분. 게임 난이도(쉬움/보통/어려움)와 헷갈리지 않게 다른 말을 쓴다.
 */
export function tierOf(rank: number, total: number): '강국' | '중견' | '약소' {
  return rank < Math.ceil(total / 3) ? '강국' : rank < Math.ceil((total * 2) / 3) ? '중견' : '약소';
}
