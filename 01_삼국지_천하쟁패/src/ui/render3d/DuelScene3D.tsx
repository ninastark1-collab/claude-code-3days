import { useRef, useState } from 'react';
import type { DuelLog } from '../../engine/battle/types';
import { DuelStage, scriptFromRounds, type DuelScript } from '../../render3d/stages/duel';
import type { HeroDesc } from '../../render3d/models/hero';
import { inkOn } from '../theme';
import { Scene3D } from './Scene3D';
import { quality3D } from './support';

const ROUND_HZ = ['一合', '二合', '三合', '四合', '五合', '六合'];

export interface DuelSide {
  name: string;
  zi?: string;
  war: number;
  desc: HeroDesc;
  fc: string;
  ch: string;
  portrait: string | null;
}

/**
 * 일기토 전용 3D 무대 화면 (디자인 수정 2): 위 양 끝에 초상·이름·자·무력·체력, 가운데 합 표시, 아래 한 줄 문구,
 * 위아래 검은 띠, 오른쪽 아래 건너뛰기. 승패·피해는 엔진 일기토 결과(duel)를 그대로 재생한다.
 */
export function DuelScene3D({ duel, a, b, onEnd }: { duel: DuelLog; a: DuelSide; b: DuelSide; onEnd: () => void }) {
  const stage = useRef<DuelStage | null>(null);
  const [hp, setHp] = useState<[number, number]>([100, 100]);
  const [round, setRound] = useState(-1);
  const [line, setLine] = useState<{ text: string; cls: string; id: number }>({ text: '', cls: '', id: 0 });
  const [vs, setVs] = useState(true);
  const [floats, setFloats] = useState<{ id: number; side: 'a' | 'b'; text: string }[]>([]);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onEnd();
  };
  const loser: DuelScript['loser'] = !duel.winner ? null : duel.winner === duel.a ? 'b' : 'a';
  const script: DuelScript = {
    a: { desc: a.desc, fc: a.fc, ch: a.ch },
    b: { desc: b.desc, fc: b.fc, ch: b.ch },
    beats: scriptFromRounds(duel.rounds, 4),
    loser,
  };
  const side = (s: DuelSide, h: number, right: boolean) => (
    <div className={`d3-side ${right ? 'r' : ''}`} style={{ ['--c' as string]: s.fc }}>
      {s.portrait ? <img src={s.portrait} alt="" /> : <b className="d3-seal" style={{ background: s.fc, color: inkOn(s.fc) }}>{s.ch}</b>}
      <div className="d3-info">
        <strong>
          {s.name} {s.zi && <small>{s.zi}</small>}
        </strong>
        <small>무력 {s.war}</small>
        <i>
          <s style={{ width: `${Math.max(0, h)}%` }} />
        </i>
      </div>
    </div>
  );
  return (
    <div className="screen duel3d-stage" style={{ zIndex: 40 }}>
      <Scene3D
        makeStage={() => {
          const st = new DuelStage(script, {
            round: (i) => setRound(i),
            say: (text, cls = '') => setLine({ text, cls, id: performance.now() }),
            hp: (x, y) => setHp([x, y]),
            float: (text, s) => {
              const id = performance.now() + Math.random();
              setFloats((f) => [...f, { id, side: s, text }]);
              setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1100);
            },
            end: finish,
          });
          st.names = { a: a.name, b: b.name };
          stage.current = st;
          setTimeout(() => setVs(false), 1700);
          return st;
        }}
        quality={quality3D()}
      />
      <div className="d3-bar top" />
      <div className="d3-bar bot" />
      <div className="d3-top">
        {side(a, hp[0], false)}
        <div key={round} className="d3-round">
          {round >= 0 ? ROUND_HZ[round] : ''}
        </div>
        {side(b, hp[1], true)}
      </div>
      {vs && (
        <div className="d3-vs">
          <b>VS</b>
          <span>一騎討</span>
        </div>
      )}
      {line.text && (
        <div key={line.id} className={`d3-act ${line.cls}`}>
          {line.text}
        </div>
      )}
      {floats.map((f) => (
        <div key={f.id} className={`ft3d d3-float ${f.side}`}>
          {f.text}
        </div>
      ))}
      <button className="d3-skip glass3d" onClick={() => (stage.current?.skip(), setVs(false))}>
        건너뛰기
      </button>
    </div>
  );
}
