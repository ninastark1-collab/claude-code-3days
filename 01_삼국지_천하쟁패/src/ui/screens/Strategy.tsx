import { useEffect, useMemo, useState } from 'react';
import { campOf, eraLabel } from '../../data/eras';
import { attackOdds } from '../../engine/commands';
import { getRelation } from '../../engine/state';
import { answerProposal } from '../../engine/turn';
import { armyPower, canAttack, cityDefense, neighborsOf, officersIn } from '../../engine/world';
import { Btn, Modal, Portrait, Seal, fmt, fmtK, useGame } from '../common';
import { CitySheet } from '../components/CitySheet';
import { KindSelect, withKind } from '../components/Commands';
import type { UnitKind } from '../../engine/battle/types';
import { MapCanvas, type MapCity } from '../map/MapCanvas';
import { City3DScreen } from '../render3d/City3D';
import { Map3D } from '../render3d/Map3D';
import { CAN_3D } from '../render3d/support';
import { usePress } from '../press';
import { useSettings } from '../settings';
import { sfx } from '../sound';
import { useStore } from '../store';
import { factionBackground, factionColor, inkOn, sealChar } from '../theme';
import { useViewSize } from '../viewport';
import { ChronicleScreen } from './Chronicle';
import { DiplomacySheet } from './Diplomacy';
import { EventScene } from './Event';
import { FactionsPanel, OfficerDetailScreen, OfficerListScreen } from './Officers';
import { SettingsScreen } from './Settings';

export const SEASON = (m: number) => (m <= 3 ? '봄' : m <= 6 ? '여름' : m <= 9 ? '가을' : '겨울');

/** 날짜 표기: "흥평 원년 12월" + 작은 줄 "194년 · 겨울" */
export function useDateLabel() {
  const g = useGame();
  const showAD = useSettings((s) => s.showAD);
  const f = g.s.factions[g.s.playerFaction]!;
  return {
    main: `${eraLabel(g.s.year, campOf(f.id, f.ruler))} ${g.s.month}월`,
    sub: `${showAD ? `${g.s.year}년 · ` : ''}${SEASON(g.s.month)}`,
  };
}

/** S04 메인 맵 + 전략 화면의 모든 부품 */
export function StrategyScreen() {
  const g = useGame();
  const st = useStore();
  const view = useViewSize();
  const colorBlind = useSettings((s) => s.colorBlind);
  const [peek, setPeek] = useState<{ id: string; x: number; y: number } | null>(null);
  const me = g.s.playerFaction;

  const intel = (cityId: string) => g.s.cities[cityId]?.faction === me || neighborsOf(g, cityId).some((n) => g.s.cities[n.to]?.faction === me);
  const cities: MapCity[] = g.ix.data.cities.map((c) => {
    const cs = g.s.cities[c.id]!;
    const f = cs.faction ? g.s.factions[cs.faction] : null;
    return {
      id: c.id,
      name: c.name,
      faction: cs.faction,
      capital: f?.capital === c.id,
      seal: cs.faction ? sealChar(f!.ruler, g.ix.officer.get(f!.ruler)!.name) : undefined,
      troops: cs.faction && intel(c.id) ? officersIn(g, c.id, cs.faction).reduce((s, o) => s + o.troops, 0) : null,
    };
  });
  // 위협: 우리 도시에 붙은 적대 세력 중 병력이 수비력의 80%를 넘는 곳
  const threats = useMemo(() => {
    const t: [string, string][] = [];
    for (const c of Object.values(g.s.cities)) {
      if (c.faction !== me) continue;
      const def = cityDefense(g, c.id);
      for (const n of neighborsOf(g, c.id)) {
        const nc = g.s.cities[n.to]!;
        if (!nc.faction || nc.faction === me || !canAttack(g, nc.faction, me)) continue;
        if (armyPower(g, officersIn(g, n.to, nc.faction)) > def * 0.8) t.push([n.to, c.id]);
      }
    }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, st.rev]);

  // Space = 다음 달, Tab = 내 도시 돌아보기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (st.overlay || st.report || st.incoming) return;
      if (e.code === 'Space') {
        e.preventDefault();
        st.endTurn();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const mine = g.ix.data.cities.filter((c) => g.s.cities[c.id]!.faction === me).map((c) => c.id);
        const i = mine.indexOf(st.selectedCity ?? '');
        if (mine.length) st.focusCity(mine[(i + 1) % mine.length]!);
      } else if (e.key === 'Escape') st.selectCity(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const sheetOpen = !!st.selectedCity;
  const showEvents = !st.incoming && !st.report && g.s.messages.some((m) => m.kind === 'event');

  return (
    <div className="screen">
      {CAN_3D ? (
        <Map3D
          paused={st.overlay?.kind === 'city3d'}
          month={g.s.month}
          names={Object.fromEntries(cities.map((c) => [c.id, c.name]))}
          cities={cities}
          roads={g.ix.data.roads}
          selected={st.selectedCity}
          threats={threats}
          colorBlind={colorBlind}
          focus={st.focus}
          rightInset={sheetOpen ? 392 : 0}
          onSelect={(id) => {
            if (!id) return st.selectCity(null);
            sfx('click');
            st.focusCity(id);
          }}
          onPeek={(id, at) => setPeek(id && at ? { id, x: at.x, y: at.y } : null)}
        />
      ) : (
      <MapCanvas
        cities={cities}
        roads={g.ix.data.roads}
        selected={st.selectedCity}
        threats={threats}
        colorBlind={colorBlind}
        focus={st.focus}
        rightInset={sheetOpen ? 392 : 0}
        onSelect={(id) => {
          if (!id) return st.selectCity(null);
          sfx('click');
          // 시트가 열리면 지도를 옮겨 그 도시가 시트 왼쪽에 보이게 한다 (S05)
          st.focusCity(id);
        }}
        onPeek={(id, at) => setPeek(id && at ? { id, x: at.x, y: at.y } : null)}
      />
      )}
      <TopBand />
      <Rail />
      {peek && !sheetOpen && <PeekCard id={peek.id} x={Math.min(peek.x + 14, view.w - 210)} y={Math.min(peek.y + 14, view.h - 130)} intel={intel(peek.id)} />}
      {!sheetOpen && <TodoChips threats={threats} />}
      {!sheetOpen && <EndTurnButton />}
      {sheetOpen && <CitySheet key={st.selectedCity} cityId={st.selectedCity!} onClose={() => st.selectCity(null)} />}

      {st.overlay?.kind === 'officers' && <OfficerListScreen city={st.overlay.city} />}
      {st.overlay?.kind === 'officer' && <OfficerDetailScreen id={st.overlay.id} />}
      {st.overlay?.kind === 'diplomacy' && <DiplomacySheet city={st.overlay.city} />}
      {st.overlay?.kind === 'city3d' && <City3DScreen cityId={st.overlay.id} />}
      {st.overlay?.kind === 'chronicle' && <ChronicleScreen />}
      {st.overlay?.kind === 'settings' && <SettingsScreen />}
      {st.overlay?.kind === 'factions' && <FactionsPanel />}

      {st.incoming ? <IncomingModal /> : st.report ? <TurnReport /> : showEvents ? <EventScene /> : <ProposalModal />}
      {st.busy && <div className="busy">다른 세력이 움직이고 있습니다…</div>}
    </div>
  );
}

/** 위쪽 띠: 문장 · 날짜 · 자원 · 설정 (읽기 전용 정보만) */
function TopBand() {
  const g = useGame();
  const open = useStore((s) => s.open);
  const cb = useSettings((s) => s.colorBlind);
  const d = useDateLabel();
  const sheetOpen = useStore((s) => !!s.selectedCity);
  const me = g.s.playerFaction;
  const f = g.s.factions[me]!;
  const rb = g.ix.officer.get(f.ruler)!;
  const cs = Object.values(g.s.cities).filter((c) => c.faction === me);
  const troops = Object.values(g.s.officers)
    .filter((o) => o.status === 'serving' && o.faction === me)
    .reduce((s, o) => s + o.troops, 0);
  return (
    <div className={`m-top ${sheetOpen ? 'sheet-open' : ''}`}>
      <div className="crest" style={{ background: factionBackground(me, cb), color: inkOn(factionColor(me)) }} title={f.name}>
        {sealChar(f.ruler, rb.name)}
      </div>
      <div className="date">
        {d.main}
        <small>{d.sub}</small>
      </div>
      <div className="res">
        <div>
          <span className="k">금</span>
          <b>{fmt(cs.reduce((s, c) => s + c.gold, 0))}</b>
        </div>
        <div>
          <span className="k">병량</span>
          <b>{fmt(cs.reduce((s, c) => s + c.food, 0))}</b>
        </div>
        <div>
          <span className="k">병력</span>
          <b>{fmt(troops)}</b>
        </div>
        <div>
          <span className="k">도시</span>
          <b>{cs.length}</b>
        </div>
      </div>
      <button className="menu-btn" onClick={() => open({ kind: 'settings' })} aria-label="설정">
        設
      </button>
    </div>
  );
}

/** 왼쪽 세로 메뉴: 勢 將 外 史 */
function Rail() {
  const g = useGame();
  const { overlay, open } = useStore();
  const unhappy = Object.values(g.s.officers).filter((o) => o.status === 'serving' && o.faction === g.s.playerFaction && o.loyalty < 60 && g.s.factions[g.s.playerFaction]!.ruler !== o.id).length;
  const items: [string, string, () => void, boolean][] = [
    ['勢', '세력', () => open(overlay?.kind === 'factions' ? null : { kind: 'factions' }), overlay?.kind === 'factions'],
    ['將', '무장', () => open({ kind: 'officers' }), overlay?.kind === 'officers'],
    ['外', '외교', () => open({ kind: 'diplomacy' }), overlay?.kind === 'diplomacy'],
    ['史', '연대기', () => open({ kind: 'chronicle' }), overlay?.kind === 'chronicle'],
  ];
  return (
    <div className="rail">
      {items.map(([hz, label, fn, on]) => (
        <button key={hz} className={`sbtn ${on ? 'on' : ''}`} onClick={fn} title={label}>
          <b>{hz}</b>
          <span>{label}</span>
          {hz === '將' && unhappy > 0 && <i className="badge">{unhappy}</i>}
        </button>
      ))}
    </div>
  );
}

/** 왼쪽 아래: 이번 달 할 일 */
function TodoChips({ threats }: { threats: [string, string][] }) {
  const g = useGame();
  const { focusCity, open } = useStore();
  const me = g.s.playerFaction;
  const waiting = g.ix.data.cities.filter((c) => g.s.cities[c.id]!.faction === me && officersIn(g, c.id, me).some((o) => !o.acted));
  const ruler = g.s.factions[me]!.ruler;
  const unhappy = Object.values(g.s.officers)
    .filter((o) => o.status === 'serving' && o.faction === me && o.id !== ruler && o.loyalty < 60)
    .sort((a, b) => a.loyalty - b.loyalty)[0];
  const t = threats[0];
  return (
    <div className="todo">
      {waiting.length > 0 && (
        <button className="chip" onClick={() => focusCity(waiting[0]!.id)}>
          <i />
          명령 대기 도시 {waiting.length}
        </button>
      )}
      {t && (
        <button className="chip bad" onClick={() => focusCity(t[1])}>
          <i />
          {g.s.factions[g.s.cities[t[0]]!.faction!]!.name} 접근
        </button>
      )}
      {unhappy && (
        <button className="chip" onClick={() => open({ kind: 'officer', id: unhappy.id })}>
          <i />
          {g.ix.officer.get(unhappy.id)!.name} 불만
        </button>
      )}
    </div>
  );
}

/** 오른쪽 아래 주사색 "다음 달": 누르면 남은 명령이 있을 때 한 번 확인, 길게 누르면 바로 진행 */
function EndTurnButton() {
  const g = useGame();
  const { endTurn, busy } = useStore();
  const [confirm, setConfirm] = useState(false);
  const idle = Object.values(g.s.officers).filter((o) => o.status === 'serving' && o.faction === g.s.playerFaction && !o.acted).length;
  const press = usePress({
    onPress: () => (idle > 0 ? setConfirm(true) : endTurn()),
    onLong: () => endTurn(),
  });
  return (
    <>
      <button className="endturn" disabled={busy} {...press} aria-label="다음 달">
        <div>
          <b>다음 달</b>
          <span>{idle ? `남은 명령 ${idle}` : 'Space'}</span>
        </div>
      </button>
      {confirm && (
        <Modal
          title="다음 달로 넘어갈까요?"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Btn onClick={() => setConfirm(false)}>더 명령하기</Btn>
              <Btn
                kind="red"
                onClick={() => {
                  setConfirm(false);
                  endTurn();
                }}
              >
                다음 달
              </Btn>
            </>
          }
        >
          <p>아직 명령을 받지 않은 무장이 {idle}명 있습니다. (버튼을 길게 누르면 확인 없이 바로 넘어갑니다)</p>
        </Modal>
      )}
    </>
  );
}

/** 엿보기 카드 (길게 누르기 / 마우스 올리기) */
function PeekCard({ id, x, y, intel }: { id: string; x: number; y: number; intel: boolean }) {
  const g = useGame();
  const c = g.s.cities[id]!;
  const f = c.faction ? g.s.factions[c.faction] : null;
  const me = g.s.playerFaction;
  const rel = c.faction && c.faction !== me ? getRelation(g.s, me, c.faction) : null;
  const troops = c.faction ? officersIn(g, id, c.faction).reduce((s, o) => s + o.troops, 0) : 0;
  return (
    <div className="peek" style={{ left: x, top: y }}>
      <div className="t">
        {g.ix.city.get(id)!.name}{' '}
        <span className="dim small">
          {f?.name ?? '공백지'}
          {c.governor ? ` · 태수 ${g.ix.officer.get(c.governor)!.name}` : ''}
        </span>
      </div>
      {intel ? (
        <div className="rows">
          <span>병력</span>
          <span>{fmt(troops)}</span>
          <span>병량</span>
          <span>{fmt(c.food)}</span>
          <span>민심</span>
          <span>{c.support}</span>
          {rel && (
            <>
              <span>관계</span>
              <span className={rel.treaty !== 'none' ? 'good' : rel.friendship < 30 ? 'bad' : 'warn'}>
                {rel.treaty === 'alliance' ? '동맹' : rel.treaty === 'truce' ? '정전' : rel.friendship < 30 ? '적대' : '중립'} {rel.friendship}
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="dim small">멀리 떨어져 자세히 알 수 없다.</div>
      )}
    </div>
  );
}

let lastToasted: unknown = null;

/** S07 턴 시작 보고: 긴급·중요만 모달, 정보는 접어 둔다 */
function TurnReport() {
  const { report, closeReport, focusCity, toast } = useStore();
  const [open, setOpen] = useState(false);
  const r = report!;
  const empty = !r.urgent.length && !r.important.length;
  useEffect(() => {
    if (!empty) return;
    // 긴급·중요가 없으면 모달 없이 한 줄만 알린다 (같은 보고를 두 번 알리지 않게 보고 객체로 구분)
    if (lastToasted !== r && r.info.length) toast(`${r.title} · ${r.sub} · 정보 ${r.info.length}건은 연대기(史)에`);
    lastToasted = r;
    closeReport();
  });
  if (empty) return null;
  const go = (city?: string) => {
    closeReport();
    if (city) focusCity(city);
  };
  return (
    <Modal title={r.title} width={540} footer={<Btn kind="primary" onClick={closeReport} style={{ width: 120 }}>확인</Btn>}>
      <div className="dim small" style={{ marginTop: -6 }}>
        {r.sub}
      </div>
      {r.urgent.map((it, i) => (
        <div key={`u${i}`} className="report-row urgent">
          <i />
          <span>
            <b>긴급</b>
            <br />
            {it.text}
          </span>
          {it.city ? (
            <Btn small kind="red" onClick={() => go(it.city)}>
              보기
            </Btn>
          ) : (
            <span />
          )}
        </div>
      ))}
      {r.important.map((it, i) => (
        <div key={`i${i}`} className="report-row important">
          <i />
          <span>
            <b>중요</b>
            <br />
            {it.text}
          </span>
          {it.city ? (
            <Btn small onClick={() => go(it.city)}>
              보기
            </Btn>
          ) : (
            <span />
          )}
        </div>
      ))}
      {r.info.length > 0 && (
        <>
          <button className="fold" onClick={() => setOpen(!open)}>
            정보 {r.info.length}건 {open ? '▴' : '▾'}
          </button>
          {open && (
            <div className="log-list dim">
              {r.info.map((t, i) => (
                <div key={i}>· {t}</div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function ProposalModal() {
  const g = useGame();
  const bump = useStore((s) => s.bump);
  const toast = useStore((s) => s.toast);
  const p = g.s.proposals[0];
  if (!p) return null;
  const from = g.s.factions[p.from];
  const envoy = g.ix.officer.get(p.envoy);
  const answer = (yes: boolean) => {
    const text = answerProposal(g, 0, yes);
    if (text) toast(text);
    bump();
  };
  return (
    <Modal
      title="사신 도착"
      footer={
        <>
          <Btn onClick={() => answer(false)}>거절</Btn>
          <Btn kind="primary" onClick={() => answer(true)}>
            수락
          </Btn>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {envoy && <Portrait officerId={envoy.id} name={envoy.name} faction={p.from} size={96} />}
        <p className="disp" style={{ fontSize: 'var(--fs-h3)', lineHeight: 1.55, margin: 0 }}>
          {from?.name}의 사신 {envoy?.name}: “
          {p.type === 'alliance' ? '우리 두 나라가 힘을 합쳐 동맹을 맺는 것이 어떻겠습니까?' : '잠시 창을 거두고 정전하는 것이 서로에게 이롭지 않겠습니까?'}”
        </p>
      </div>
    </Modal>
  );
}

/** 적의 침공: 직접 지휘 또는 위임 */
function IncomingModal() {
  const g = useGame();
  const setup = useStore((s) => s.incoming)!;
  const commandIncoming = useStore((s) => s.commandIncoming);
  const atk = g.s.factions[setup.attacker]!;
  const troops = setup.units.reduce((s, u) => s + u.troops, 0);
  const odds = attackOdds(g, setup);
  // 수비 부대 병과 (출진 화면과 같은 고르기, 기본은 자동) — createBattle 이 고르는 수비 무장과 같은 목록
  const [kinds, setKinds] = useState<Record<string, UnitKind>>({});
  const cityFaction = g.s.cities[setup.city]!.faction;
  const defenders = officersIn(g, setup.city, cityFaction)
    .filter((o) => o.troops > 0)
    .sort((a, b) => b.troops - a.troops)
    .slice(0, 10);
  return (
    <Modal
      title="적의 침공"
      width={540}
      footer={
        <>
          <Btn onClick={() => commandIncoming(false)}>위임 (자동 전투)</Btn>
          <Btn kind="red" onClick={() => commandIncoming(true, kinds)}>
            직접 지휘
          </Btn>
        </>
      }
    >
      <div className="report-row urgent">
        <i />
        <span>
          <b>긴급</b>
          <br />
          {atk.name}이(가) {g.ix.city.get(setup.from)!.name}에서 <b style={{ color: 'var(--g-text)', letterSpacing: 0 }}>{g.ix.city.get(setup.city)!.name}</b>
          (으)로 쳐들어왔다.
        </span>
        <span />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {setup.units.map((u) => (
          <span key={u.officer} className="off" style={{ cursor: 'default' }}>
            <Seal id={u.officer} name={g.ix.officer.get(u.officer)!.name} faction={setup.attacker} />
            {g.ix.officer.get(u.officer)!.name}
          </span>
        ))}
      </div>
      <div className="dim small num">
        적 병력 {fmtK(troops)} · 적 전력비 {odds.toFixed(2)} (1보다 크면 적이 우세)
      </div>
      {defenders.length > 0 && (
        <>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            수비 부대 병종 — 직접 지휘할 때 적용됩니다. 자동이면 작전(농성/출격)에 맞춰 정합니다.
          </p>
          <div className="def-kinds">
            {defenders.map((o) => (
              <label key={o.id} className="def-kind">
                <span>
                  {g.ix.officer.get(o.id)!.name} <span className="dim num">{fmtK(o.troops)}</span>
                </span>
                <KindSelect value={kinds[o.id]} onChange={(v) => setKinds((k) => withKind(k, o.id, v))} />
              </label>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

export function EndingScreen() {
  const g = useGame();
  const quit = useStore((s) => s.quitToTitle);
  const e = g.s.ending;
  // 승패 소리는 엔딩 곡이 맡는다 (음향_BGM_큐시트 2장 ③)
  return (
    <div className="screen ending-screen">
      <div className="abs" style={{ left: 'var(--sa)', top: 40, width: 150, height: 150 }}>
        <div className={`big-seal ${e?.type === 'victory' ? '' : 'lose'}`}>{e?.type === 'victory' ? '統' : '亡'}</div>
      </div>
      <div className="abs" style={{ left: 240, right: 'var(--sa)', top: 40, display: 'grid', gap: 12 }}>
        <div className="disp" style={{ fontSize: 'var(--fs-h1)' }}>
          {e?.type === 'victory' ? '천하통일' : '패망'}
        </div>
        <p className="disp" style={{ fontSize: 'var(--fs-h3)', lineHeight: 1.6, margin: 0 }}>
          {e?.text}
        </p>
        <div className="dim num">
          {g.s.year}년 {g.s.month}월
        </div>
      </div>
      <div className="abs" style={{ right: 'var(--sa)', bottom: 14 }}>
        <Btn kind="primary" onClick={quit} style={{ width: 140 }}>
          타이틀로
        </Btn>
      </div>
    </div>
  );
}
