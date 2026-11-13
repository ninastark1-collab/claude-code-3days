import { useEffect, useRef, useState } from 'react';
import { duelHighlights } from '../../engine/battle/duel';
import type { DuelLog } from '../../engine/battle/types';
import { josa } from '../../engine/josa';
import { Btn, Portrait } from '../common';
import { InkCanvas } from '../components/Ink';
import { sfx } from '../sound';
import { factionColor } from '../theme';

/** 한 합 재생 시간 (설계서 9-3 ③: 0.8~1.2초) */
const ROUND_MS = 1000;
/** 도입: 도전 대사 → 응답 대사 */
const INTRO_MS = 2800;
/** 결정타 뒤 멈춤 */
const DECISIVE_HOLD_MS = 1000;
/** 결과 문구 */
const RESULT_MS = 2400;
/** 건너뛰어도 최소한 보여 주는 시간 (①②⑤) */
const MIN_MS = 1500;

type Phase = 'intro' | 'rounds' | 'result';

/**
 * 일기토 장면 (옛 수동 전투 S14 화면을 되살린 것, v2 설계서 9-3).
 * 도입(도전·응답 대사) → 결정적인 합만 1초씩 → 결정타(흔들림·정지) → 결과·사기 변화 → 자동으로 전장 복귀.
 * 화면을 누르면 결과로 건너뛴다 (최소 1.5초는 보여 준다).
 */
export function DuelScene({ duel, onDone, replay }: { duel: DuelLog; onDone: () => void; replay?: boolean }) {
  const show = duelHighlights(duel.rounds);
  const [phase, setPhase] = useState<Phase>('intro');
  const [step, setStep] = useState(0); // 도입: 0 도전 1 응답 / 합: show 인덱스
  const [shake, setShake] = useState(false);
  const t0 = useRef(performance.now());
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (phase === 'intro') {
      if (step === 0) t = setTimeout(() => setStep(1), INTRO_MS / 2);
      else t = setTimeout(() => (setPhase('rounds'), setStep(0)), INTRO_MS / 2);
    } else if (phase === 'rounds') {
      const last = step >= show.length - 1;
      if (last) {
        setShake(true);
        sfx('hit');
        t = setTimeout(() => (setShake(false), setPhase('result')), ROUND_MS + DECISIVE_HOLD_MS);
      } else {
        if (step > 0) sfx('click');
        t = setTimeout(() => setStep(step + 1), ROUND_MS);
      }
    } else {
      sfx(duel.winner ? 'win' : 'ok');
      if (!replay) t = setTimeout(finish, RESULT_MS);
    }
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step]);

  const skip = () => {
    if (phase === 'result') return finish();
    const wait = MIN_MS - (performance.now() - t0.current);
    if (wait > 0) setTimeout(() => setPhase('result'), wait);
    else setPhase('result');
  };

  const r = phase === 'intro' ? { aHp: 100, bHp: 100, text: '' } : phase === 'rounds' ? duel.rounds[show[step] ?? 0]! : duel.rounds[duel.rounds.length - 1] ?? { aHp: 100, bHp: 100, text: '' };
  const roundNo = phase === 'intro' ? 0 : phase === 'rounds' ? (show[step] ?? 0) + 1 : duel.rounds.length;
  const strong = (duel.bWar ?? 0) >= (duel.aWar ?? 0) - 5;
  const lineA = duel.lineA ?? `${duel.b}! 나와 승부를 겨루자!`;
  const lineB = duel.lineB ?? (strong ? '좋다, 상대해 주마!' : '……피할 수는 없겠구나.');
  const aLost = duel.winner === duel.b;
  const bLost = duel.winner === duel.a;
  const fa = factionColor(duel.aFaction ?? null);
  const fb = factionColor(duel.bFaction ?? null);
  const center =
    phase === 'intro'
      ? step === 0
        ? `${duel.a} 「${lineA}」`
        : `${duel.b} 「${lineB}」`
      : phase === 'rounds'
        ? r.text
        : duel.outcome;

  return (
    <div className={`screen duel-scene ${shake ? 'shake' : ''}`} style={{ zIndex: 40 }} onClick={skip} role="dialog" aria-label={`일기토 ${duel.a} 대 ${duel.b}`}>
      <InkCanvas seed={(duel.tick ?? 7) + 3} split={[fa, fb]} />
      <Fighter side="a" name={duel.a} id={duel.aId} faction={duel.aFaction} war={duel.aWar} hp={r.aHp} lost={phase === 'result' && aLost} won={phase === 'result' && bLost} />
      <Fighter side="b" name={duel.b} id={duel.bId} faction={duel.bFaction} war={duel.bWar} hp={r.bHp} lost={phase === 'result' && bLost} won={phase === 'result' && aLost} />
      <div className="duel-mark">
        <b>一騎</b>
        <span>{phase === 'intro' ? '일기토' : `제 ${roundNo}합 / ${duel.rounds.length}합`}</span>
      </div>
      <div className={`duel-text ${phase}`} aria-live="polite">
        {center}
        {phase === 'result' && duel.winner && (
          <div className="duel-morale">
            {josa(duel.winner, '이/가')} 이끄는 부대 사기 +{duel.moraleWin ?? 30} · {aLost ? duel.a : duel.b} 쪽 전군 사기 {duel.moraleLose ?? -8}
          </div>
        )}
        {duel.source && phase !== 'rounds' && <div className="duel-source">{duel.source}</div>}
      </div>
      <div className="abs" style={{ right: 'var(--sa)', bottom: 14 }} onClick={(e) => e.stopPropagation()}>
        {phase === 'result' ? (
          <Btn kind="primary" onClick={finish}>
            {replay ? '닫기' : '전장으로'}
          </Btn>
        ) : (
          <Btn onClick={skip}>건너뛰기</Btn>
        )}
      </div>
    </div>
  );
}

function Fighter(p: { side: 'a' | 'b'; name: string; id?: string; faction?: string | null; war?: number; hp: number; lost: boolean; won: boolean }) {
  const hp = Math.max(0, Math.round(p.hp));
  return (
    <div className={`duel-fighter ${p.side}`}>
      <div className="duel-face">
        <Portrait officerId={p.id} name={p.name} faction={p.faction ?? null} size={96} expr={p.lost ? 'hurt' : p.won ? 'smile' : 'angry'} />
      </div>
      <div className="duel-info">
        <div className="duel-name">{p.name}</div>
        <div className="dim">무력 {p.war ?? '?'}</div>
        <div className="duel-hp">
          <i style={{ width: `${hp}%` }} />
        </div>
        <div className="small">체력 {hp}</div>
      </div>
    </div>
  );
}
