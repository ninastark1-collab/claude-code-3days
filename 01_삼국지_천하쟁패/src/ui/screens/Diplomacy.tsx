import { useState } from 'react';
import { diploGift, diploPropose, diploSurrender } from '../../engine/commands';
import { JOINT_COST, JOINT_MONTHS, activePacts, allyReinforcements, diploJointAttack, jointChance, jointTargets, pactFor } from '../../engine/joint';
import { getRelation } from '../../engine/state';
import { citiesOf, factionTotals, officersIn } from '../../engine/world';
import { Bar, Btn, fmtK, useGame } from '../common';
import { EnvoyScene, type EnvoyKind, type EnvoyMission } from '../components/EnvoyScene';
import { useSettings } from '../settings';
import { useStore } from '../store';
import { factionBackground, factionColor, inkOn, sealChar } from '../theme';

/**
 * S10 외교: 각 세력과의 우호도를 막대로. 사신은 (지정 도시 또는 전체에서) 매력이 가장 높은 대기 무장이 자동으로 간다.
 * 사신을 보내면 상대 군주와 대화하는 연출이 나온다. 동맹국과는 적 도시를 함께 치는 협공을 약속할 수 있다.
 */
export function DiplomacySheet({ city }: { city?: string }) {
  const g = useGame();
  const { open, run } = useStore();
  const cb = useSettings((s) => s.colorBlind);
  const me = g.s.playerFaction;
  const others = Object.values(g.s.factions)
    .filter((f) => f.alive && f.id !== me)
    .sort((a, b) => getRelation(g.s, me, b.id).friendship - getRelation(g.s, me, a.id).friendship);
  const [sel, setSel] = useState<string | null>(others[0]?.id ?? null);
  const [mission, setMission] = useState<EnvoyMission | null>(null);
  const [jointPick, setJointPick] = useState(false);
  const pool = city ? officersIn(g, city, me) : citiesOf(g, me).flatMap((c) => officersIn(g, c.id, me));
  // 군주는 직접 사신으로 가지 않는다 (보낼 무장이 군주뿐일 때만)
  const ruler = g.s.factions[me]!.ruler;
  const idleEnvoys = pool.filter((o) => !o.acted).sort((a, b) => g.ix.officer.get(b.id)!.charisma - g.ix.officer.get(a.id)!.charisma);
  const envoy = idleEnvoys.find((o) => o.id !== ruler) ?? idleEnvoys[0];
  const target = sel ? g.s.factions[sel] : null;
  const rel = sel ? getRelation(g.s, me, sel) : null;
  const mineT = factionTotals(g, me);
  const theirs = sel ? factionTotals(g, sel) : null;
  const pacts = activePacts(g).filter((p) => p.by === me);
  const joints = sel && rel?.treaty === 'alliance' ? jointTargets(g, me, sel) : [];
  const cname = (id: string) => g.ix.city.get(id)!.name;

  /** 사신을 보내고 결과를 연출로 보여 준다 */
  const send = (kind: EnvoyKind, cityId?: string) => {
    if (!sel || !envoy) return;
    const envoyId = envoy.id;
    const tgt = sel;
    const r = run((gg) => {
      if (kind === 'gift') return diploGift(gg, envoyId, tgt, 300);
      if (kind === 'surrender') return diploSurrender(gg, envoyId, tgt);
      if (kind === 'joint') return diploJointAttack(gg, envoyId, tgt, cityId!);
      return diploPropose(gg, envoyId, tgt, kind);
    }, true);
    if (!r.ok) return;
    const after = getRelation(g.s, me, tgt);
    const accepted =
      kind === 'gift'
        ? true
        : kind === 'surrender'
          ? !g.s.factions[tgt]?.alive
          : kind === 'joint'
            ? !!pactFor(g, me, cityId!)
            : after.treaty === kind;
    setJointPick(false);
    setMission({ kind, envoy: envoyId, target: tgt, accepted, msg: r.msg, city: cityId ? cname(cityId) : undefined });
  };

  return (
    <aside className="sheet with-top" style={{ width: 430 }} aria-label="외교">
      <span className="grab" />
      <div className="sheet-head">
        <div className="crumb">외교 · 상대 {others.length}개 세력</div>
        <button className="back" onClick={() => open(null)} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="scroll" style={{ display: 'grid', gap: 3, alignContent: 'start', flex: 1 }}>
        {others.map((f) => {
          const r = getRelation(g.s, me, f.id);
          const col = factionColor(f.id);
          return (
            <button
              key={f.id}
              className={`pick ${sel === f.id ? 'sel' : ''}`}
              style={{ gridTemplateColumns: 'auto 1fr 90px 44px', gap: 10 }}
              onClick={() => (setSel(f.id), setJointPick(false))}
            >
              <i className="sl" style={{ width: 26, height: 26, fontSize: 14, background: factionBackground(f.id, cb), color: inkOn(col) }}>
                {sealChar(f.ruler, g.ix.officer.get(f.ruler)!.name)}
              </i>
              <span className="disp" style={{ fontSize: 'var(--fs-lead)' }}>
                {f.name}
                {r.treaty !== 'none' && <span className="tag">{r.treaty === 'alliance' ? '동맹' : '정전'}</span>}
                {pacts.some((p) => p.ally === f.id) && <span className="tag">협공</span>}
              </span>
              <Bar value={r.friendship} tone={r.friendship < 30 ? 'bad' : r.friendship > 50 ? 'good' : 'warn'} />
              <span className="v small">{r.friendship}</span>
            </button>
          );
        })}
      </div>
      {target && rel && theirs && (
        <div style={{ background: 'var(--g-lacquer-2)', borderRadius: 3, padding: '8px 10px', display: 'grid', gap: 3 }} className="small">
          <span className="lbl">
            <span>{target.name}</span>
            <span>
              도시 {theirs.cities} · 병력 {fmtK(theirs.troops)} (우리 {fmtK(mineT.troops)})
            </span>
          </span>
          <span>
            {rel.treaty === 'alliance' ? `동맹 중 · ${rel.treatyMonths}개월 남음` : rel.treaty === 'truce' ? `정전 중 · ${rel.treatyMonths}개월 남음` : rel.friendship < 30 ? '적대 — 언제든 쳐들어올 수 있다' : '조약 없음'}
          </span>
          {pacts
            .filter((p) => p.ally === target.id)
            .map((p) => (
              <span key={p.city} className="good">
                협공 약속: {cname(p.city)} · {p.until - (g.s.year * 12 + g.s.month) + 1}개월 안에 출진하면 원군 {allyReinforcements(g, me, p.city).length}부대 합류
              </span>
            ))}
          <span className="dim">사신: {envoy ? `${g.ix.officer.get(envoy.id)!.name} (매력 ${g.ix.officer.get(envoy.id)!.charisma})` : '보낼 수 있는 무장이 없다'}</span>
        </div>
      )}
      {jointPick && sel && envoy ? (
        <div style={{ display: 'grid', gap: 4 }}>
          <div className="lbl small">
            <span>어느 도시를 함께 치겠습니까? (군자금 {JOINT_COST} · {JOINT_MONTHS}개월 유효)</span>
            <Btn small onClick={() => setJointPick(false)}>
              취소
            </Btn>
          </div>
          {joints.length ? (
            joints.map((cid) => {
              const owner = g.s.cities[cid]!.faction!;
              const help = allyReinforcements(g, me, cid).length;
              return (
                <button key={cid} className="pick" style={{ gridTemplateColumns: '1fr auto auto', gap: 10 }} disabled={!!pactFor(g, me, cid)} onClick={() => send('joint', cid)}>
                  <span>
                    <b>{cname(cid)}</b> <span className="dim small">({g.s.factions[owner]!.name})</span>
                  </span>
                  <span className="dim small">{pactFor(g, me, cid) ? '약속됨' : `수락 ${jointChance(g, envoy.id, me, sel, cid)}%`}</span>
                  <span className="dim micro">{help ? '' : '지금은 원군 여력 없음'}</span>
                </button>
              );
            })
          ) : (
            <p className="dim small">우리와 {target?.name} 양쪽에 맞닿은 적 도시가 없습니다.</p>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 5 }}>
          <Btn small disabled={!envoy || !sel} onClick={() => send('gift')} style={{ flexDirection: 'column', minHeight: 48, gap: 0 }}>
            친선
            <span className="dim micro">금 300</span>
          </Btn>
          <Btn small disabled={!envoy || !sel || rel?.treaty === 'truce'} onClick={() => send('truce')} style={{ flexDirection: 'column', minHeight: 48, gap: 0 }}>
            정전
            <span className="dim micro">우호 높을수록</span>
          </Btn>
          <Btn
            small
            disabled={!envoy || !sel || (rel?.friendship ?? 0) < 60 || rel?.treaty === 'alliance'}
            onClick={() => send('alliance')}
            style={{ flexDirection: 'column', minHeight: 48, gap: 0 }}
          >
            동맹
            <span className="dim micro">우호 60 필요</span>
          </Btn>
          <Btn small disabled={!envoy || !sel || rel?.treaty !== 'alliance'} onClick={() => setJointPick(true)} style={{ flexDirection: 'column', minHeight: 48, gap: 0 }}>
            협공
            <span className="dim micro">동맹국과</span>
          </Btn>
          <Btn small disabled={!envoy || !sel || (theirs?.cities ?? 9) > 3} onClick={() => send('surrender')} style={{ flexDirection: 'column', minHeight: 48, gap: 0 }}>
            항복 권고
            <span className="dim micro">도시 3 이하</span>
          </Btn>
        </div>
      )}
      {mission && <EnvoyScene mission={mission} onClose={() => setMission(null)} />}
    </aside>
  );
}
