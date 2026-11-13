import { useRef, useState } from 'react';
import { conscript, develop, search, train, type Result } from '../../engine/commands';
import type { Game } from '../../engine/ctx';
import { josa } from '../../engine/josa';
import type { OfficerState } from '../../engine/state';
import { maxTroops, monthlyGold, officersIn } from '../../engine/world';
import { CityStage, CMD_SPOT, type CityCmd, type Spot } from '../../render3d/stages/city';
import { fmt, Portrait, useGame } from '../common';
import { useStore } from '../store';
import { factionColor, inkOn, sealChar } from '../theme';
import { useViewSize } from '../viewport';
import { Scene3D, seasonOf } from './Scene3D';
import { quality3D } from './support';

/** 시안 CMDS: 명령 카드 (한자·이름·비용·맡을 능력치) */
const CMDS: { id: CityCmd; hz: string; name: string; cost: (g: Game, o: OfficerState) => number; stat: 'politics' | 'war' | 'leadership' | 'charisma' | 'intelligence'; run: (g: Game, id: string) => Result }[] = [
  { id: 'agriculture', hz: '開', name: '개간', cost: () => 50, stat: 'politics', run: (g, id) => develop(g, id, 'agriculture') },
  { id: 'commerce', hz: '商', name: '상업', cost: () => 50, stat: 'politics', run: (g, id) => develop(g, id, 'commerce') },
  { id: 'order', hz: '治', name: '치안', cost: () => 30, stat: 'war', run: (g, id) => develop(g, id, 'order') },
  {
    id: 'conscript',
    hz: '徵',
    name: '징병',
    // 엔진 징병 공식의 평균값 (실제 비용은 엔진이 정한다)
    cost: (g, o) => {
      const c = g.s.cities[o.city]!;
      const cha = g.ix.officer.get(o.id)!.charisma;
      return Math.round(Math.max(0, Math.min(maxTroops(g, o.id) - o.troops, Math.round((cha * 40 + c.support * 20 + 500) / 100) * 100, Math.floor(c.population * 0.03))) / 10);
    },
    stat: 'charisma',
    run: conscript,
  },
  { id: 'train', hz: '練', name: '훈련', cost: () => 0, stat: 'leadership', run: train },
  { id: 'search', hz: '訪', name: '인재', cost: () => 0, stat: 'intelligence', run: search },
];
/** 명령 응답 대사 (S33): 맡은 장수가 한마디 */
const REPLY: Record<CityCmd, string> = {
  agriculture: '밭을 일구겠습니다.',
  commerce: '저잣거리를 살리겠습니다.',
  order: '거리를 단속하겠습니다.',
  conscript: '장정을 모으겠습니다.',
  train: '군사를 조련하겠습니다.',
  search: '인재를 찾아보겠습니다.',
};
const DISTRICT: Partial<Record<Spot, [string, string]>> = {
  field: ['농지', '개간으로 넓힌다. 가을에 병량이 들어온다.'],
  market: ['시장', '상업 수치만큼 매달 금이 들어온다.'],
  yamen: ['관청', '태수가 머문다. 치안·민심을 다룬다.'],
  barracks: ['병영', '징병한 병사가 이곳에서 훈련한다.'],
  smithy: ['대장간', '무기를 만든다.'],
};

/**
 * 내정 3D 도시 화면 (시안 hud-city 배치 그대로).
 * 명령 카드를 누르면 가장 알맞은 대기 장수가 맡고(엔진 명령 실행), 결과가 도시에서 벌어지며 바뀐 수치(엔진 값)가 +숫자로 뜬다.
 * 장수는 한 달에 한 가지만: 맡으면 초상이 회색 + 일 이름. "다음 달"에 풀린다.
 */
export function City3DScreen({ cityId }: { cityId: string }) {
  const g = useGame();
  const st = useStore();
  const view = useViewSize();
  const stage = useRef<CityStage | null>(null);
  const [jobs, setJobs] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<Spot | null>(null);
  const [floats, setFloats] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const [, bump] = useState(0);
  const [say, setSay] = useState<{ id: string; text: string; at: number } | null>(null);
  const c = g.s.cities[cityId]!;
  const cb = g.ix.city.get(cityId)!;
  const me = g.s.playerFaction;
  const f = g.s.factions[me]!;
  const fc = factionColor(me);
  const here = officersIn(g, cityId, me);
  const troops = here.reduce((s, o) => s + o.troops, 0);
  const avgTrain = troops ? Math.round(here.reduce((s, o) => s + o.training * o.troops, 0) / troops) : 0;
  const season = g.s.month <= 3 ? '봄' : g.s.month <= 6 ? '여름' : g.s.month <= 9 ? '가을' : '겨울';

  const best = (cmd: (typeof CMDS)[number]) =>
    here
      .filter((o) => !o.acted && (cmd.id !== 'train' || o.troops > 0) && (cmd.id !== 'conscript' || o.troops < maxTroops(g, o.id)))
      .sort((a, b) => g.ix.officer.get(b.id)![cmd.stat] - g.ix.officer.get(a.id)![cmd.stat])[0];

  const runCmd = (cmd: (typeof CMDS)[number]) => {
    const o = best(cmd);
    if (!o) return;
    const before = { ...c, troops, free: Object.values(g.s.officers).filter((x) => x.status === 'free' && x.city === cityId && x.found).length };
    const r = st.run((gg) => cmd.run(gg, o.id));
    if (!r.ok) return;
    setJobs((j) => ({ ...j, [o.id]: cmd.name }));
    setSay({ id: o.id, text: REPLY[cmd.id], at: performance.now() });
    setTimeout(() => setSay((s) => (s && performance.now() - s.at > 2000 ? null : s)), 2200);
    // 바뀐 수치 (엔진 값) → 도시 위 +숫자
    const after = g.s.cities[cityId]!;
    const nowTroops = officersIn(g, cityId, me).reduce((s, x) => s + x.troops, 0);
    const diffs: string[] = [];
    const d = (label: string, a: number, b: number) => b !== a && diffs.push(`${label} ${b > a ? '+' : ''}${fmt(b - a)}`);
    d('농업', before.agriculture, after.agriculture);
    d('상업', before.commerce, after.commerce);
    d('치안', before.order, after.order);
    d('민심', before.support, after.support);
    d('병력', before.troops, nowTroops);
    if (cmd.id === 'train') diffs.push(r.msg.replace(/^.*?: /, '').split(' · ')[0]!);
    const found = Object.values(g.s.officers).filter((x) => x.status === 'free' && x.city === cityId && x.found).length > before.free;
    stage.current?.react(cmd.id === 'search' && !found ? 'order' : cmd.id, { agriRatio: after.agriculture / cb.maxAgriculture });
    if (cmd.id === 'search' && found) diffs.push('새 인재 발견 — 인사·등용');
    const spot = stage.current?.spotScreen(CMD_SPOT[cmd.id], view.w, view.h);
    if (spot && diffs.length) {
      const id = performance.now();
      // 카메라가 날아간 뒤 자리 위에 띄운다
      setTimeout(() => {
        const p = stage.current?.spotScreen(CMD_SPOT[cmd.id], view.w, view.h) ?? spot;
        setFloats((fl) => [...fl, { id, x: p.x, y: p.y, text: diffs.join(' · ') }]);
        setTimeout(() => setFloats((fl) => fl.filter((x) => x.id !== id)), 1800);
      }, 900);
    }
    bump((n) => n + 1);
  };

  const stat = (name: string, v: number, max: number) => (
    <div className="cs" key={name}>
      <span>{name}</span>
      <i>
        <s style={{ width: `${Math.round((100 * v) / Math.max(1, max))}%` }} />
      </i>
      <em>{v}</em>
    </div>
  );

  return (
    <div className="screen city3d-screen" style={{ zIndex: 20 }}>
      <Scene3D
        makeStage={() => {
          const s = new CityStage(fc, { agri: c.agriculture / cb.maxAgriculture, stalls: Math.round((c.commerce / cb.maxCommerce) * 12), drill: Math.round(troops / 1500) });
          stage.current = s;
          return s;
        }}
        quality={quality3D()}
        season={seasonOf(g.s.month)}
        input={{
          onTap: (ndc) => {
            const k = stage.current?.pick(ndc) ?? null;
            setInfo(k && DISTRICT[k] ? k : null);
            if (k) stage.current?.focus(k);
          },
        }}
      />
      <div className="c-top glass3d">
        <b className="seal3d" style={{ background: fc, color: inkOn(fc) }}>
          {sealChar(f.ruler, g.ix.officer.get(f.ruler)!.name)}
        </b>
        <div className="nm">
          <strong>{cb.name}</strong>
          <small>
            {g.s.year}년 {g.s.month}월 · {season}
            {f.capital === cityId ? ' · 본거지' : ''}
          </small>
        </div>
        <div className="c-res num">
          <span>
            <small>金</small>
            {fmt(c.gold)}
          </span>
          <span>
            <small>糧</small>
            {fmt(c.food)}
          </span>
          <span>
            <small>兵</small>
            {fmt(troops)}
          </span>
          <span>
            <small>民</small>
            {Math.round(c.population / 10000)}만
          </span>
        </div>
      </div>
      <div className="c-btns">
        <button className="glass3d" onClick={() => st.open(null)}>
          천하 지도
        </button>
        <button className="pri" onClick={() => (st.open(null), st.endTurn())}>
          다음 달
        </button>
      </div>
      <div className="c-stats glass3d">
        {stat('농업', c.agriculture, cb.maxAgriculture)}
        {stat('상업', c.commerce, cb.maxCommerce)}
        {stat('치안', c.order, 100)}
        {stat('민심', c.support, 100)}
        {stat('훈련', avgTrain, 100)}
        <div className="dim micro">이번 달 금 +{fmt(monthlyGold(c))}</div>
      </div>
      <div className="c-off">
        {here.map((o) => {
          const b = g.ix.officer.get(o.id)!;
          const job = jobs[o.id] ?? (o.acted ? '완료' : null);
          return (
            <div key={o.id} className={`co ${o.acted ? 'co-busy' : ''}`} title={b.name}>
              <Portrait officerId={o.id} name={b.name} faction={me} size={42} gray={o.acted} />
              <span>{b.name}</span>
              {job && <em>{job}</em>}
              {say?.id === o.id && <q className="co-say">{say.text}</q>}
            </div>
          );
        })}
      </div>
      {info && DISTRICT[info] && (
        <div className="cinfo glass3d on">
          <strong>{DISTRICT[info]![0]}</strong>
          <small>{DISTRICT[info]![1]}</small>
        </div>
      )}
      <div className="c-cards">
        {CMDS.map((cmd) => {
          const o = best(cmd);
          const cost = o ? cmd.cost(g, o) : 0;
          const done = Object.values(jobs).includes(cmd.name);
          return (
            <button key={cmd.id} className="tc cc" disabled={!o || c.gold < cost} onClick={() => runCmd(cmd)} title={o ? `${josa(g.ix.officer.get(o.id)!.name, '이/가')} 맡는다` : '맡을 장수가 없다'}>
              <b>{cmd.hz}</b>
              <span>{cmd.name}</span>
              <small>{cost ? `金 ${cost}` : o ? g.ix.officer.get(o.id)!.name : '-'}</small>
              {done && <i className="ok">완료</i>}
            </button>
          );
        })}
      </div>
      {floats.map((fl) => (
        <div key={fl.id} className="ft3d gold" style={{ transform: `translate(${fl.x}px, ${fl.y}px) translate(-50%, 0)` }}>
          {fl.text}
        </div>
      ))}
    </div>
  );
}
