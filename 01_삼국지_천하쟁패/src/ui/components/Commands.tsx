import { useMemo, useState, type ReactNode } from 'react';
import type { UnitKind } from '../../engine/battle/types';
import { KIND_NAME, matchupText } from '../../engine/battle/types';
import { allyReinforcements } from '../../engine/joint';
import {
  DEVELOP_COST,
  appointGovernor,
  attackOdds,
  conscript,
  develop,
  diploGift,
  diploPropose,
  diploSurrender,
  discordChance,
  discordCooldown,
  rumorChance,
  handleCaptive,
  moveOfficer,
  prepareAttack,
  recruit,
  recruitChance,
  recruitCooldown,
  relief,
  reward,
  rumor,
  search,
  sowDiscord,
  train,
  transferTroops,
  transport,
  type DevelopKind,
} from '../../engine/commands';
import type { Game } from '../../engine/ctx';
import { getRelation, type OfficerState } from '../../engine/state';
import {
  canAttack,
  captivesOf,
  citiesOf,
  valuesDistance,
  freeOfficersIn,
  maxTroops,
  neighborsOf,
  officersIn,
  ownPathExists,
} from '../../engine/world';
import { Btn, Modal, Seal, fmt, useGame } from '../common';
import { useStore } from '../store';

export type CommandKey =
  | DevelopKind
  | 'relief'
  | 'search'
  | 'conscript'
  | 'train'
  | 'attack'
  | 'troops'
  | 'transport'
  | 'recruit'
  | 'reward'
  | 'move'
  | 'governor'
  | 'captive'
  | 'diplomacy'
  | 'rumor'
  | 'discord';

type StatKey = 'leadership' | 'war' | 'intelligence' | 'politics' | 'charisma';
const STAT_LABEL: Record<StatKey, string> = { leadership: '통솔', war: '무력', intelligence: '지력', politics: '정치', charisma: '매력' };

/** 무장 선택 목록 */
function OfficerPicker(props: {
  officers: OfficerState[];
  stat?: StatKey;
  onPick?: (id: string) => void;
  selected?: string[];
  onToggle?: (id: string) => void;
  extra?: (o: OfficerState) => ReactNode;
  allowActed?: boolean;
}) {
  const g = useGame();
  const list = [...props.officers].sort((a, b) =>
    props.stat ? g.ix.officer.get(b.id)![props.stat] - g.ix.officer.get(a.id)![props.stat] : 0,
  );
  if (!list.length) return <p className="muted">해당하는 무장이 없습니다.</p>;
  return (
    <div className="picker">
      {list.map((o) => {
        const b = g.ix.officer.get(o.id)!;
        const disabled = o.acted && !props.allowActed;
        const sel = props.selected?.includes(o.id);
        return (
          <div
            key={o.id}
            className={`pick-row ${disabled ? 'disabled' : ''} ${sel ? 'sel' : ''}`}
            onClick={() => {
              if (disabled) return;
              props.onToggle ? props.onToggle(o.id) : props.onPick?.(o.id);
            }}
          >
            {props.onToggle && <input type="checkbox" readOnly checked={!!sel} disabled={disabled} />}
            <Seal id={o.id} name={b.name} faction={o.faction} size={24} />
            <span className="oname">{b.name}</span>
            {props.stat && (
              <span className="hl-stat">
                {STAT_LABEL[props.stat]} {b[props.stat]}
              </span>
            )}
            <span className="muted small">
              병 {fmt(o.troops)} · 훈 {o.training}
            </span>
            {props.extra?.(o)}
            {disabled && <span className="tag">행동완료</span>}
          </div>
        );
      })}
    </div>
  );
}

/** 내정·징병·훈련처럼 무장마다 따로 하는 명령: 여러 명을 골라 한 번에 실행 */
function MultiCommand(props: {
  title: string;
  stat: StatKey;
  fn: (g: Game, id: string) => { ok: boolean; msg: string };
  note?: string;
  officers: OfficerState[];
  onClose: () => void;
}) {
  const run = useStore((s) => s.run);
  const idle = props.officers.filter((o) => !o.acted).map((o) => o.id);
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const execute = () => {
    const r = run((gg) => {
      let okCount = 0;
      const fails: string[] = [];
      const lines: string[] = [];
      for (const id of sel) {
        const res = props.fn(gg, id);
        if (res.ok) {
          okCount++;
          lines.push(res.msg);
        } else fails.push(`${gg.ix.officer.get(id)!.name}: ${res.msg}`);
      }
      const head = `${props.title}: ${okCount}명 실행${fails.length ? `, ${fails.length}명 실패` : ''}`;
      const detail = okCount === 1 && !fails.length ? lines[0]! : [head, ...fails.slice(0, 2)].join(' / ');
      return { ok: okCount > 0, msg: detail };
    });
    if (r.ok) props.onClose();
  };
  return (
    <Modal
      title={props.title}
      onClose={props.onClose}
      footer={
        <>
          <Btn small onClick={() => setSel(sel.length === idle.length ? [] : idle)} disabled={!idle.length}>
            {sel.length === idle.length && idle.length ? '선택 해제' : '대기 장수 전원 선택'}
          </Btn>
          <Btn kind="primary" disabled={!sel.length} onClick={execute}>
            실행 ({sel.length}명)
          </Btn>
        </>
      }
    >
      {props.note && <p className="muted">{props.note}</p>}
      <OfficerPicker officers={props.officers} stat={props.stat} selected={sel} onToggle={toggle} />
    </Modal>
  );
}

export function CommandDialog({ cmd, cityId, onClose }: { cmd: CommandKey; cityId: string; onClose: () => void }) {
  const g = useGame();
  const me = g.s.playerFaction;
  const here = officersIn(g, cityId, me);
  const run = useStore((s) => s.run);
  const simple = (title: string, stat: StatKey, fn: (g: Game, id: string) => { ok: boolean; msg: string }, note?: string) => (
    <MultiCommand title={title} stat={stat} fn={fn} note={note} officers={here} onClose={onClose} />
  );

  switch (cmd) {
    case 'agriculture':
      return simple('농업 개발', 'politics', (gg, id) => develop(gg, id, 'agriculture'), `금 ${DEVELOP_COST.agriculture} 소비. 정치가 높을수록 효과적. 9월 수확량 증가.`);
    case 'commerce':
      return simple('상업 투자', 'politics', (gg, id) => develop(gg, id, 'commerce'), `금 ${DEVELOP_COST.commerce} 소비. 매달 금 수입 증가.`);
    case 'walls':
      return simple('성벽 보수', 'leadership', (gg, id) => develop(gg, id, 'walls'), `금 ${DEVELOP_COST.walls} 소비. 방어전의 성벽·성문 내구도.`);
    case 'order':
      return simple('치안 강화', 'war', (gg, id) => develop(gg, id, 'order'), `금 ${DEVELOP_COST.order} 소비. 치안이 높으면 수입 증가.`);
    case 'relief':
      return simple('군량 배급', 'charisma', relief, '군량을 풀어 민심을 올립니다.');
    case 'search':
      return simple('인재 탐색', 'intelligence', search, '재야 무장이나 숨은 자금을 찾습니다.');
    case 'conscript':
      return simple('징병', 'charisma', conscript, '병사 1명당 금 0.1. 인구와 민심이 조금 줄어듭니다.');
    case 'train':
      return simple('훈련', 'leadership', train, '훈련도가 높을수록 전투력이 오릅니다.');
    case 'attack':
      return <AttackDialog cityId={cityId} onClose={onClose} />;
    case 'troops':
      return <TroopsDialog cityId={cityId} onClose={onClose} />;
    case 'transport':
      return <TransportDialog cityId={cityId} onClose={onClose} />;
    case 'recruit':
      return <RecruitDialog cityId={cityId} onClose={onClose} />;
    case 'reward':
      return (
        <Modal title="포상 (금 100)" onClose={onClose}>
          <OfficerPicker
            officers={here.filter((o) => g.s.factions[me]!.ruler !== o.id)}
            allowActed
            extra={(o) => <span className={`loyal ${o.loyalty < 60 ? 'low' : ''}`}>충성 {o.loyalty}</span>}
            onPick={(id) => run((gg) => reward(gg, me, id, 100))}
          />
        </Modal>
      );
    case 'move':
      return <MoveDialog cityId={cityId} onClose={onClose} />;
    case 'governor':
      return (
        <Modal title="태수 임명" onClose={onClose}>
          <OfficerPicker
            officers={here}
            allowActed
            stat="politics"
            onPick={(id) => {
              if (run((gg) => appointGovernor(gg, cityId, id)).ok) onClose();
            }}
          />
        </Modal>
      );
    case 'captive':
      return <CaptiveDialog onClose={onClose} />;
    case 'diplomacy':
      return <DiplomacyDialog cityId={cityId} onClose={onClose} />;
    case 'rumor':
      return <RumorDialog cityId={cityId} onClose={onClose} />;
    case 'discord':
      return <DiscordDialog cityId={cityId} onClose={onClose} />;
  }
}

// ───────────────────────────── 출진 ─────────────────────────────

function AttackDialog({ cityId, onClose }: { cityId: string; onClose: () => void }) {
  const g = useGame();
  const me = g.s.playerFaction;
  const attack = useStore((s) => s.attack);
  const toast = useStore((s) => s.toast);
  const targets = neighborsOf(g, cityId).filter((n) => {
    const c = g.s.cities[n.to]!;
    return c.faction !== me && canAttack(g, me, c.faction);
  });
  const [target, setTarget] = useState<string | null>(targets[0]?.to ?? null);
  const [sel, setSel] = useState<string[]>([]);
  const [kinds, setKinds] = useState<Record<string, UnitKind>>({});
  const avail = officersIn(g, cityId, me).filter((o) => o.troops > 0);
  const troops = sel.reduce((s, id) => s + g.s.officers[id]!.troops, 0);
  const minFood = Math.ceil(troops / 10);
  const city = g.s.cities[cityId]!;
  const [food, setFood] = useState(0);
  const foodV = Math.max(minFood, Math.min(food || minFood * 3, city.food));
  // 동맹 협공 약속이 있으면 원군이 합류한다 (전력비에도 넣는다)
  const allies = target ? allyReinforcements(g, me, target) : [];
  const odds =
    target && sel.length
      ? attackOdds(g, { units: [...sel.map((id) => ({ officer: id, troops: g.s.officers[id]!.troops })), ...allies.map((a) => ({ officer: a.officer, troops: a.troops }))], city: target })
      : 0;

  if (!targets.length) {
    return (
      <Modal title="출진" onClose={onClose}>
        <p>공격할 수 있는 인접 도시가 없습니다. (동맹·정전 세력은 공격 불가)</p>
      </Modal>
    );
  }
  return (
    <Modal
      title="출진"
      onClose={onClose}
      width={640}
      footer={
        <>
          <span className="muted">
            병력 {fmt(troops)} · 전력비 <b className={odds >= 1.3 ? 'good' : odds < 0.8 ? 'bad' : ''}>{odds ? odds.toFixed(2) : '-'}</b>
          </span>
          <Btn
            kind="primary"
            disabled={!target || !sel.length || foodV > city.food}
            onClick={() => {
              const setup = prepareAttack(g, me, cityId, target!, sel, foodV);
              if (typeof setup === 'string') return toast(setup, false);
              onClose();
              attack(setup, kinds);
            }}
          >
            출진!
          </Btn>
        </>
      }
    >
      <div className="row-wrap">
        {targets.map((n) => {
          const c = g.s.cities[n.to]!;
          return (
            <button key={n.to} className={`chip ${target === n.to ? 'active' : ''}`} onClick={() => setTarget(n.to)}>
              <span className="swatch" style={{ background: c.faction ? g.s.factions[c.faction]!.color : '#888' }} />
              {g.ix.city.get(n.to)!.name} ({c.faction ? g.s.factions[c.faction]!.name : '공백'}){n.kind === 'water' ? ' 🌊' : ''}
            </button>
          );
        })}
      </div>
      {allies.length > 0 && (
        <p className="good small">
          협공 원군 합류: {allies.map((a) => `${g.ix.officer.get(a.officer)!.name}(${fmt(a.troops)})`).join(', ')} — {g.s.factions[allies[0]!.faction]!.name}
        </p>
      )}
      <p className="muted small">출진 무장 (최대 5명) — 병종을 고를 수 있습니다.</p>
      <OfficerPicker
        officers={avail}
        stat="leadership"
        selected={sel}
        onToggle={(id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 5 ? [...s, id] : s))}
        extra={(o) =>
          sel.includes(o.id) ? (
            <KindSelect value={kinds[o.id]} onChange={(v) => setKinds((k) => withKind(k, o.id, v))} />
          ) : null
        }
      />
      <label className="slider">
        군량 {fmt(foodV)} (최소 {fmt(minFood)} = 10일분, 보유 {fmt(city.food)})
        <input type="range" min={minFood} max={Math.max(minFood, city.food)} step={100} value={foodV} onChange={(e) => setFood(Number(e.target.value))} />
      </label>
    </Modal>
  );
}

// ───────────────────────────── 군사 보조 ─────────────────────────────

function TroopsDialog({ cityId, onClose }: { cityId: string; onClose: () => void }) {
  const g = useGame();
  const run = useStore((s) => s.run);
  const here = officersIn(g, cityId, g.s.playerFaction);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState(1000);
  const max = from && to ? Math.min(g.s.officers[from]!.troops, maxTroops(g, to) - g.s.officers[to]!.troops) : 0;
  return (
    <Modal
      title="병력 분배"
      onClose={onClose}
      footer={
        <Btn kind="primary" disabled={!from || !to || max <= 0} onClick={() => from && to && run((gg) => transferTroops(gg, from, to, Math.min(amount, max)))}>
          옮기기
        </Btn>
      }
    >
      <div className="two-col">
        <div>
          <h4>보내는 무장</h4>
          <OfficerPicker
            officers={here.filter((o) => o.troops > 0)}
            allowActed
            selected={from ? [from] : []}
            onPick={(id) => {
              setFrom(id);
              if (to === id) setTo(null);
            }}
          />
        </div>
        <div>
          <h4>받는 무장</h4>
          <OfficerPicker
            officers={here.filter((o) => o.id !== from)}
            allowActed
            selected={to ? [to] : []}
            onPick={setTo}
            extra={(o) => <span className="muted small">최대 {fmt(maxTroops(g, o.id))}</span>}
          />
        </div>
      </div>
      <label className="slider">
        {fmt(Math.min(amount, max))}명
        <input type="range" min={0} max={Math.max(0, max)} step={100} value={Math.min(amount, max)} onChange={(e) => setAmount(Number(e.target.value))} />
      </label>
    </Modal>
  );
}

function TransportDialog({ cityId, onClose }: { cityId: string; onClose: () => void }) {
  const g = useGame();
  const me = g.s.playerFaction;
  const run = useStore((s) => s.run);
  const c = g.s.cities[cityId]!;
  const dests = citiesOf(g, me).filter((x) => x.id !== cityId && ownPathExists(g, me, cityId, x.id));
  const [dest, setDest] = useState<string | null>(dests[0]?.id ?? null);
  const [gold, setGold] = useState(0);
  const [food, setFood] = useState(0);
  return (
    <Modal title="수송" onClose={onClose}>
      <div className="row-wrap">
        {dests.map((d) => (
          <button key={d.id} className={`chip ${dest === d.id ? 'active' : ''}`} onClick={() => setDest(d.id)}>
            {g.ix.city.get(d.id)!.name}
          </button>
        ))}
        {!dests.length && <p className="muted">아군 영토로 이어진 다른 도시가 없습니다.</p>}
      </div>
      <label className="slider">
        금 {fmt(gold)} / {fmt(c.gold)}
        <input type="range" min={0} max={c.gold} step={50} value={gold} onChange={(e) => setGold(Number(e.target.value))} />
      </label>
      <label className="slider">
        군량 {fmt(food)} / {fmt(c.food)}
        <input type="range" min={0} max={c.food} step={500} value={food} onChange={(e) => setFood(Number(e.target.value))} />
      </label>
      <p className="muted small">수송할 무장을 고르세요:</p>
      <OfficerPicker
        officers={officersIn(g, cityId, me)}
        onPick={(id) => {
          if (dest && run((gg) => transport(gg, id, dest, gold, food)).ok) onClose();
        }}
      />
    </Modal>
  );
}

// ───────────────────────────── 인사 ─────────────────────────────

function RecruitDialog({ cityId, onClose }: { cityId: string; onClose: () => void }) {
  const g = useGame();
  const me = g.s.playerFaction;
  const run = useStore((s) => s.run);
  const [target, setTarget] = useState<string | null>(null);
  const free = freeOfficersIn(g, cityId, true);
  // 인접한 적 도시의 무장
  const enemies = neighborsOf(g, cityId).flatMap((n) => {
    const c = g.s.cities[n.to]!;
    return c.faction && c.faction !== me ? officersIn(g, n.to, c.faction).filter((o) => g.s.factions[c.faction!]!.ruler !== o.id) : [];
  });
  const here = officersIn(g, cityId, me);
  // 성공률 0%(군주의 의형제·아들 등)인 적 무장은 목록에서 제외
  const recruitable = enemies.filter((o) => here.some((h) => recruitChance(g, h.id, o.id) > 0));
  const ruler = g.ix.officer.get(g.s.factions[me]!.ruler)!;
  const row = (o: OfficerState, label: string) => {
    const b = g.ix.officer.get(o.id)!;
    return (
      <div key={o.id} className={`pick-row ${target === o.id ? 'sel' : ''}`} onClick={() => setTarget(o.id)}>
        <Seal id={o.id} name={b.name} faction={o.faction} size={24} />
        <span className="oname">{b.name}</span>
        <span className="muted small">
          {label} · {b.leadership}/{b.war}/{b.intelligence}/{b.politics}/{b.charisma} · 가치관 차 {valuesDistance(ruler.values, b.values)}
          {o.status === 'serving' && ` · 충성 ${o.loyalty}`}
          {o.status === 'serving' && recruitCooldown(g, o.id) > 0 && ` · 경계 중 ${recruitCooldown(g, o.id)}개월`}
        </span>
      </div>
    );
  };
  return (
    <Modal title="등용" onClose={onClose} width={640}>
      {!target ? (
        <>
          <h4>재야 (발견됨)</h4>
          {free.length ? free.map((o) => row(o, '재야')) : <p className="muted">발견된 재야 무장이 없습니다. 먼저 인재 탐색을 하세요.</p>}
          <h4>인접 적 무장 (회유, 금 100)</h4>
          {recruitable.length ? (
            recruitable.map((o) => row(o, g.s.factions[o.faction!]!.name))
          ) : (
            <p className="muted">회유할 수 있는 인접 적 무장이 없습니다.</p>
          )}
          <p className="muted small">충성 80 이상인 적 장수는 회유되지 않습니다. 계략의 이간으로 충성을 먼저 떨어뜨리세요. 거절당하면 그 장수는 3개월 동안 경계합니다.</p>
        </>
      ) : (
        <>
          <p>
            <b>{g.ix.officer.get(target)!.name}</b>을(를) 설득할 무장을 고르세요.{' '}
            <Btn small onClick={() => setTarget(null)}>
              대상 다시 고르기
            </Btn>
          </p>
          <OfficerPicker
            officers={here}
            stat="charisma"
            extra={(o) => <span className="chance">성공률 {recruitChance(g, o.id, target)}%</span>}
            onPick={(id) => {
              run((gg) => recruit(gg, id, target));
              onClose();
            }}
          />
        </>
      )}
    </Modal>
  );
}

function MoveDialog({ cityId, onClose }: { cityId: string; onClose: () => void }) {
  const g = useGame();
  const me = g.s.playerFaction;
  const run = useStore((s) => s.run);
  const dests = citiesOf(g, me).filter((x) => x.id !== cityId && ownPathExists(g, me, cityId, x.id));
  const [dest, setDest] = useState<string | null>(dests[0]?.id ?? null);
  const [sel, setSel] = useState<string[]>([]);
  return (
    <Modal
      title="이동"
      onClose={onClose}
      footer={
        <Btn
          kind="primary"
          disabled={!dest || !sel.length}
          onClick={() => {
            for (const id of sel) run((gg) => moveOfficer(gg, id, dest!));
            onClose();
          }}
        >
          이동
        </Btn>
      }
    >
      <div className="row-wrap">
        {dests.map((d) => (
          <button key={d.id} className={`chip ${dest === d.id ? 'active' : ''}`} onClick={() => setDest(d.id)}>
            {g.ix.city.get(d.id)!.name}
          </button>
        ))}
        {!dests.length && <p className="muted">이동할 수 있는 아군 도시가 없습니다.</p>}
      </div>
      <OfficerPicker officers={officersIn(g, cityId, me)} selected={sel} onToggle={(id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
    </Modal>
  );
}

function CaptiveDialog({ onClose }: { onClose: () => void }) {
  const g = useGame();
  const me = g.s.playerFaction;
  const run = useStore((s) => s.run);
  const caps = captivesOf(g, me);
  return (
    <Modal title="포로 처우" onClose={onClose} width={620}>
      {!caps.length && <p className="muted">포로가 없습니다.</p>}
      {caps.map((o) => {
        const b = g.ix.officer.get(o.id)!;
        return (
          <div key={o.id} className="pick-row">
            <Seal id={o.id} name={b.name} faction={o.faction} size={24} />
            <span className="oname">{b.name}</span>
            <span className="muted small">
              {o.faction ? g.s.factions[o.faction]?.name : ''} · {b.leadership}/{b.war}/{b.intelligence}/{b.politics}/{b.charisma} · 성공률{' '}
              {recruitChance(g, g.s.factions[me]!.ruler, o.id)}%
            </span>
            <span className="actions">
              <Btn small disabled={o.acted} onClick={() => run((gg) => handleCaptive(gg, me, o.id, 'recruit'))}>
                등용
              </Btn>
              <Btn small onClick={() => run((gg) => handleCaptive(gg, me, o.id, 'release'))}>
                석방
              </Btn>
              <Btn
                small
                kind="danger"
                onClick={() => {
                  if (window.confirm(`정말 ${b.name}을(를) 처형하시겠습니까? 되돌릴 수 없습니다.`)) run((gg) => handleCaptive(gg, me, o.id, 'execute'));
                }}
              >
                처형
              </Btn>
            </span>
          </div>
        );
      })}
    </Modal>
  );
}

// ───────────────────────────── 외교 · 계략 ─────────────────────────────

function DiplomacyDialog({ cityId, onClose }: { cityId: string; onClose: () => void }) {
  const g = useGame();
  const me = g.s.playerFaction;
  const run = useStore((s) => s.run);
  const [target, setTarget] = useState<string | null>(null);
  const [type, setType] = useState<'gift' | 'alliance' | 'truce' | 'surrender'>('gift');
  const others = Object.values(g.s.factions).filter((f) => f.alive && f.id !== me);
  return (
    <Modal title="외교" onClose={onClose} width={620}>
      <table className="table compact">
        <thead>
          <tr>
            <th>세력</th>
            <th>군주</th>
            <th>도시</th>
            <th>우호</th>
            <th>관계</th>
          </tr>
        </thead>
        <tbody>
          {others.map((f) => {
            const r = getRelation(g.s, me, f.id);
            return (
              <tr key={f.id} className={target === f.id ? 'sel' : ''} onClick={() => setTarget(f.id)}>
                <td>
                  <span className="swatch" style={{ background: f.color }} />
                  {f.name}
                </td>
                <td>{g.ix.officer.get(f.ruler)!.name}</td>
                <td className="num">{citiesOf(g, f.id).length}</td>
                <td className="num">{r.friendship}</td>
                <td>{r.treaty === 'alliance' ? `동맹 ${r.treatyMonths}개월` : r.treaty === 'truce' ? `정전 ${r.treatyMonths}개월` : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row-wrap">
        {(
          [
            ['gift', '친선 (금 300)'],
            ['alliance', '동맹 제의'],
            ['truce', '정전 제의'],
            ['surrender', '항복 권고'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`chip ${type === k ? 'active' : ''}`} onClick={() => setType(k)}>
            {l}
          </button>
        ))}
      </div>
      {target ? (
        <>
          <p className="muted small">사신으로 보낼 무장 (매력·지력이 높을수록 유리):</p>
          <OfficerPicker
            officers={officersIn(g, cityId, me)}
            stat="charisma"
            onPick={(id) => {
              const r = run((gg) =>
                type === 'gift' ? diploGift(gg, id, target, 300) : type === 'surrender' ? diploSurrender(gg, id, target) : diploPropose(gg, id, target, type),
              );
              if (r.ok) onClose();
            }}
          />
        </>
      ) : (
        <p className="muted">대상 세력을 고르세요.</p>
      )}
    </Modal>
  );
}

function RumorDialog({ cityId, onClose }: { cityId: string; onClose: () => void }) {
  const g = useGame();
  const me = g.s.playerFaction;
  const run = useStore((s) => s.run);
  const [target, setTarget] = useState<string | null>(null);
  const targets = useMemo(() => {
    const set = new Set<string>();
    for (const c of citiesOf(g, me)) for (const n of neighborsOf(g, c.id)) if (g.s.cities[n.to]?.faction && g.s.cities[n.to]!.faction !== me) set.add(n.to);
    return [...set];
  }, [g, me]);
  return (
    <Modal title="유언비어 (금 50)" onClose={onClose}>
      <div className="row-wrap">
        {targets.map((id) => (
          <button key={id} className={`chip ${target === id ? 'active' : ''}`} onClick={() => setTarget(id)}>
            {g.ix.city.get(id)!.name} (치안 {g.s.cities[id]!.order})
          </button>
        ))}
        {!targets.length && <p className="muted">인접한 적 도시가 없습니다.</p>}
      </div>
      {target && (
        <OfficerPicker
          officers={officersIn(g, cityId, me)}
          stat="intelligence"
          extra={(o) => <span className="chance">성공률 {rumorChance(g, o.id, target)}%</span>}
          onPick={(id) => {
            if (run((gg) => rumor(gg, id, target)).ok) onClose();
          }}
        />
      )}
    </Modal>
  );
}

function DiscordDialog({ cityId, onClose }: { cityId: string; onClose: () => void }) {
  const g = useGame();
  const me = g.s.playerFaction;
  const run = useStore((s) => s.run);
  const [target, setTarget] = useState<string | null>(null);
  const enemies = useMemo(() => {
    const set = new Set<string>();
    for (const c of citiesOf(g, me))
      for (const n of neighborsOf(g, c.id)) {
        const cc = g.s.cities[n.to]!;
        if (cc.faction && cc.faction !== me) for (const o of officersIn(g, n.to, cc.faction)) if (g.s.factions[cc.faction]!.ruler !== o.id) set.add(o.id);
      }
    return [...set];
  }, [g, me]);
  return (
    <Modal title="이간 (금 50)" onClose={onClose} width={600}>
      {!target ? (
        enemies.length ? (
          enemies.map((id) => {
            const b = g.ix.officer.get(id)!;
            const o = g.s.officers[id]!;
            return (
              <div key={id} className="pick-row" onClick={() => setTarget(id)}>
                <Seal id={o.id} name={b.name} faction={o.faction} size={24} />
                <span className="oname">{b.name}</span>
                <span className="muted small">
                  {g.s.factions[o.faction!]!.name} · 지력 {b.intelligence} · 충성 {o.loyalty}
                  {discordCooldown(g, id) > 0 && ` · 경계 중 (${discordCooldown(g, id)}개월)`}
                </span>
              </div>
            );
          })
        ) : (
          <p className="muted">인접한 적 무장이 없습니다.</p>
        )
      ) : (
        <>
          <p>
            대상: <b>{g.ix.officer.get(target)!.name}</b>
          </p>
          <OfficerPicker
            officers={officersIn(g, cityId, me)}
            stat="intelligence"
            extra={(o) => <span className="chance">성공률 {discordChance(g, o.id, target)}%</span>}
            onPick={(id) => {
              if (run((gg) => sowDiscord(gg, id, target)).ok) onClose();
            }}
          />
        </>
      )}
    </Modal>
  );
}

/**
 * 병과 고르기 (출진·방어전 공용). 빈 값 = 자동: 특기, 없으면 싸움 형태(공성·야전·농성)에 맞춘 비율 (engine/battle/kinds.ts)
 */
export function KindSelect({ value, onChange }: { value?: UnitKind; onChange: (v: UnitKind | undefined) => void }) {
  return (
    <select value={value ?? ''} aria-label="병과" onClick={(e) => e.stopPropagation()} onChange={(e) => onChange((e.target.value || undefined) as UnitKind | undefined)}>
      <option value="">자동</option>
      {(['infantry', 'cavalry', 'archer'] as UnitKind[]).map((k) => (
        <option key={k} value={k} title={matchupText(k)}>
          {KIND_NAME[k]} ({matchupText(k).replace(/ ×[\d.]+/g, '')})
        </option>
      ))}
    </select>
  );
}

/** 병과 표에 한 무장 값을 넣거나(자동이면) 뺀다 */
export function withKind(k: Record<string, UnitKind>, id: string, v: UnitKind | undefined): Record<string, UnitKind> {
  const n = { ...k };
  if (v) n[id] = v;
  else delete n[id];
  return n;
}
