import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { josa } from '../../engine/josa';
import { Btn, Portrait, useGame } from '../common';
import { factionColor } from '../theme';

export type EnvoyKind = 'gift' | 'truce' | 'alliance' | 'surrender' | 'joint';

export interface EnvoyMission {
  kind: EnvoyKind;
  envoy: string;
  target: string;
  /** 상대가 받아들였는지 */
  accepted: boolean;
  /** 엔진이 돌려준 결과 문장 */
  msg: string;
  /** 협공 목표 도시 이름 */
  city?: string;
}

const KIND_NAME: Record<EnvoyKind, string> = { gift: '친선', truce: '정전', alliance: '동맹', surrender: '항복 권고', joint: '협공' };

function lines(m: EnvoyMission, myRuler: string, city?: string): { ask: string; yes: string; no: string } {
  const c = city ?? '';
  switch (m.kind) {
    case 'gift':
      return { ask: `${josa(myRuler, '이/가')} 우의의 뜻으로 작은 예물을 보내셨습니다. 부디 받아 주십시오.`, yes: '귀공의 뜻은 잘 알겠소. 고맙게 받겠소.', no: '' };
    case 'truce':
      return { ask: '서로 칼을 거두고 백성을 쉬게 함이 어떻겠습니까?', yes: '좋소. 당분간 군사를 움직이지 않겠소.', no: '흥, 그대들의 속셈을 모를 줄 아는가! 돌아가라.' };
    case 'alliance':
      return { ask: '함께 손을 잡고 천하의 난을 바로잡읍시다.', yes: '좋소! 오늘부터 우리는 한 배를 탄 것이오.', no: '아직은 때가 아닌 듯하오. 돌아가 그리 전하시오.' };
    case 'surrender':
      return { ask: '대세는 이미 기울었습니다. 백성을 위해 항복하시지요.', yes: '……더 버틴들 무엇하겠소. 항복하겠소.', no: '닥쳐라! 끝까지 싸울 것이다!' };
    case 'joint':
      return {
        ask: `${josa(c, '을/를')} 양쪽에서 함께 치면 반드시 이길 것입니다. 군자금도 보내드리겠습니다.`,
        yes: `좋소, ${c} 공격에 우리 군도 나서겠소. 두 달 안에 진군하시오.`,
        no: '지금은 우리 군을 움직일 여유가 없소.',
      };
  }
}

/**
 * 외교 사신 연출: 사신이 길을 떠나 → 상대 군주 앞에서 말하고 → 상대가 답한다.
 * 화면을 누르면 다음 장면, "건너뛰기"는 결과로 바로 간다.
 */
export function EnvoyScene({ mission, onClose }: { mission: EnvoyMission; onClose: () => void }) {
  const g = useGame();
  const me = g.s.playerFaction;
  const target = g.s.factions[mission.target]!;
  const myRuler = g.ix.officer.get(g.s.factions[me]!.ruler)!.name;
  const envoyB = g.ix.officer.get(mission.envoy)!;
  const rulerB = g.ix.officer.get(target.ruler)!;
  const [step, setStep] = useState(0);
  const L = lines(mission, myRuler, mission.city);
  const reply = mission.kind === 'gift' || mission.accepted ? L.yes : L.no;
  // 0: 길 떠남 (자동으로 넘어감) → 1: 사신 말 → 2: 상대 답 → 3: 결과
  useEffect(() => {
    if (step !== 0) return;
    const t = setTimeout(() => setStep(1), 1500);
    return () => clearTimeout(t);
  }, [step]);
  const next = () => (step < 3 ? setStep(step + 1) : onClose());
  const good = mission.kind === 'gift' || mission.accepted;
  // 시트 안이 아니라 게임 화면 전체를 덮도록 (알림 영역과 같은 부모에 붙인다)
  const host = document.querySelector('.toasts')?.parentElement ?? document.body;
  return createPortal(
    <div className="scrim envoy-scrim" onClick={next} role="dialog" aria-label={`${KIND_NAME[mission.kind]} 사신`}>
      <div className="envoy" onClick={(e) => e.stopPropagation()}>
        <div className="envoy-head">
          <span className="disp">
            {KIND_NAME[mission.kind]} 사신 · {target.name}
          </span>
          <Btn small onClick={() => setStep(3)} disabled={step === 3}>
            건너뛰기
          </Btn>
        </div>
        <div className="envoy-stage" onClick={next}>
          <div className={`envoy-side ${step >= 1 ? 'arrived' : ''}`}>
            <Portrait officerId={mission.envoy} name={envoyB.name} faction={me} size={72} expr={step >= 2 && !good ? 'hurt' : step >= 2 ? 'smile' : 'neutral'} />
            <b>{envoyB.name}</b>
            <span className="dim micro">사신</span>
          </div>
          <div className="envoy-road" aria-hidden>
            <i className="envoy-flag" style={{ background: factionColor(me) }} data-go={step >= 1 ? 1 : 0} />
          </div>
          <div className="envoy-side">
            <Portrait
              officerId={target.ruler}
              name={rulerB.name}
              faction={target.id}
              size={72}
              expr={step >= 2 ? (good ? 'smile' : 'angry') : 'neutral'}
            />
            <b>{rulerB.name}</b>
            <span className="dim micro">{target.name} 군주</span>
          </div>
        </div>
        <div className="envoy-talk" onClick={next}>
          {step === 0 && <p className="dim">{josa(envoyB.name, '이/가')} {target.name}의 도성으로 길을 떠났다……</p>}
          {step === 1 && (
            <p>
              <b>{envoyB.name}</b> 「{L.ask}」
            </p>
          )}
          {step === 2 && (
            <p>
              <b>{rulerB.name}</b> 「{reply}」
            </p>
          )}
          {step === 3 && <p className={good ? 'good' : 'bad'}>{mission.msg}</p>}
          <span className="dim micro envoy-hint">{step < 3 ? '눌러서 계속' : ''}</span>
        </div>
        {step === 3 && (
          <div className="envoy-foot">
            <Btn kind="primary" onClick={onClose}>
              확인
            </Btn>
          </div>
        )}
      </div>
    </div>,
    host,
  );
}
