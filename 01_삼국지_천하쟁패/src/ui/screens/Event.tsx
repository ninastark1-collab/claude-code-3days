import { useEffect, useState } from 'react';
import { Btn, Portrait, useGame } from '../common';
import { InkCanvas } from '../components/Ink';
import { useStore } from '../store';

/**
 * S11 이벤트 대화: 연의 사건은 지도를 내려놓고 장면으로 보여 준다.
 * 오른쪽 위 자동·기록·건너뛰기. 엔진 이벤트에는 선택지가 없어서 "확인" 하나만 둔다.
 */
export function EventScene() {
  const g = useGame();
  const bump = useStore((s) => s.bump);
  const open = useStore((s) => s.open);
  const [auto, setAuto] = useState(false);
  const idx = g.s.messages.findIndex((m) => m.kind === 'event');
  const msg = idx >= 0 ? g.s.messages[idx] : undefined;
  const next = () => {
    if (idx >= 0) g.s.messages.splice(idx, 1);
    bump();
  };
  const skipAll = () => {
    g.s.messages = g.s.messages.filter((m) => m.kind !== 'event');
    bump();
  };
  useEffect(() => {
    if (!auto || !msg) return;
    const t = setTimeout(next, 4500);
    return () => clearTimeout(t);
  });
  if (!msg) return null;
  // 말하는 사람: 이름이 같은 무장 (살아 있는 쪽 우선)
  const speaker = msg.speaker
    ? g.ix.data.officers.filter((o) => o.name === msg.speaker).sort((a, b) => (g.s.officers[b.id]?.status === 'serving' ? 1 : 0) - (g.s.officers[a.id]?.status === 'serving' ? 1 : 0))[0]
    : undefined;
  const faction = speaker ? g.s.officers[speaker.id]?.faction ?? null : null;
  return (
    <div className="screen" style={{ zIndex: 25 }}>
      <InkCanvas seed={21} />
      <div className="speaker-card">
        {speaker ? <Portrait officerId={speaker.id} name={speaker.name} faction={faction} size={170} /> : <div className="hz" style={{ fontSize: 64 }}>史</div>}
        <div className="cap">{speaker ? `${speaker.name}${speaker.courtesy ? ' ' + speaker.courtesy : ''}` : '연의'}</div>
      </div>
      <div className="abs" style={{ right: 'var(--sa)', top: 12, display: 'flex', gap: 6 }}>
        <Btn small kind={auto ? 'primary' : undefined} onClick={() => setAuto(!auto)}>
          자동
        </Btn>
        <Btn small onClick={() => open({ kind: 'chronicle' })}>
          기록
        </Btn>
        <Btn small onClick={skipAll}>
          건너뛰기
        </Btn>
      </div>
      <div className="abs disp" style={{ left: 250, top: 48, right: 'var(--sa)', fontSize: 'var(--fs-h1)' }}>
        {msg.title}
      </div>
      <div className="dialogue">
        <div>
          <div className="who">{msg.speaker ?? '연의'}</div>
          <div className="line">{msg.text}</div>
        </div>
        <div style={{ display: 'grid', gap: 6, alignContent: 'center' }}>
          <Btn kind="primary" onClick={next}>
            확인
          </Btn>
        </div>
      </div>
    </div>
  );
}
