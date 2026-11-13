import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import type { Game } from '../engine/ctx';
import { portraitUri, type FaceOpts } from './portrait';
import { useSettings } from './settings';
import { sfx } from './sound';
import { useStore } from './store';
import { factionBackground, factionColor, inkOn, sealChar } from './theme';

/** 현재 게임 (rev 구독으로 엔진 변경 시 리렌더) */
export function useGame(): Game {
  useStore((s) => s.rev);
  const g = useStore((s) => s.g);
  if (!g) throw new Error('게임이 시작되지 않았습니다.');
  return g;
}

/** 시트 안에서 열린 명령 화면은 모달 대신 시트 본문으로 그린다 */
export const InlinePanel = createContext(false);

/**
 * 모달 (디자인: 최대 560×320, 긴급 알림·되돌릴 수 없는 결정에만).
 * 시트 안(InlinePanel)에서는 시트 본문 + 하단 버튼 줄로 바뀐다.
 */
export function Modal(props: { title: string; onClose?: () => void; children: ReactNode; width?: number; footer?: ReactNode }) {
  const inline = useContext(InlinePanel);
  if (inline) {
    return (
      <div className="panel-inline">
        <div className="panel-body">{props.children}</div>
        {props.footer && <div className="panel-foot">{props.footer}</div>}
      </div>
    );
  }
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && props.onClose?.()}>
      <div className="modal" style={{ width: Math.min(props.width ?? 520, 700) }} role="dialog" aria-label={props.title}>
        <div className="modal-head">
          <span className="disp">{props.title}</span>
          {props.onClose && (
            <button className="x" onClick={props.onClose} aria-label="닫기">
              ✕
            </button>
          )}
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

export function Btn(props: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  kind?: 'primary' | 'danger' | 'red' | 'plain';
  title?: string;
  small?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const k = props.kind === 'primary' ? 'pri' : props.kind === 'red' ? 'red' : props.kind === 'danger' ? 'danger' : '';
  return (
    <button
      className={`btn ${k} ${props.small ? 'sm' : ''} ${props.className ?? ''}`}
      disabled={props.disabled}
      title={props.title}
      style={props.style}
      onClick={() => {
        sfx('click');
        props.onClick?.();
      }}
    >
      {props.children}
    </button>
  );
}

/** 20pt 낙관: 세력색 바탕 + 성씨 한자 (밝은 세력색이면 먹 글자) */
export function Seal({ id, name, faction, size = 20 }: { id: string; name: string; faction: string | null; size?: number }) {
  const cb = useSettings((s) => s.colorBlind);
  const col = factionColor(faction);
  return (
    <i
      className="sl"
      style={{ width: size, height: size, fontSize: size * 0.55, background: factionBackground(faction, cb), color: inkOn(col) }}
      aria-hidden="true"
    >
      {sealChar(id, name)}
    </i>
  );
}

/**
 * 무장 초상. size: 200(상세) · 96(카드) · 44(목록, 얼굴만) · 20(낙관 글자)
 * officerId 없이 이름만 주면 낙관으로 대신한다.
 */
export function Portrait(props: { officerId?: string; name: string; faction?: string | null; size?: number; expr?: FaceOpts['expr']; age?: number; gray?: boolean }) {
  const data = useStore((s) => s.data);
  const year = useStore((s) => s.g?.s.year);
  const size = props.size ?? 44;
  const faction = props.faction ?? null;
  const o = props.officerId ? data.officers.find((x) => x.id === props.officerId) : undefined;
  if (!o || size <= 24) return <Seal id={props.officerId ?? props.name} name={props.name} faction={faction} size={size} />;
  const age = props.age ?? (year ?? 194) - o.birthYear;
  const crop = size >= 150 ? 'full' : size >= 64 ? 'card' : 'face';
  const ratio = crop === 'full' ? 240 / 200 : crop === 'card' ? 187 / 156 : 1;
  return (
    <img
      className={`portrait-img ${props.gray ? 'gray' : ''}`}
      src={portraitUri(o, { age, fc: factionColor(faction), crop, expr: props.expr })}
      width={size}
      height={Math.round(size * ratio)}
      alt={`${o.name} 초상`}
      draggable={false}
    />
  );
}

export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <span className="trk">
      <i className={tone ?? ''} style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </span>
  );
}

export const fmt = (n: number) => n.toLocaleString('ko-KR');
export const fmtK = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)}만` : fmt(n));

export const SKILL_NAME: Record<string, string> = {
  fire: '화계', cavalry: '기마', archery: '궁술', navy: '수군', siege: '공성', ambush: '매복', rumor: '유언', sow_discord: '이간',
  inspire: '고무', duel: '일기토', medicine: '의술', agriculture: '농업', commerce: '상업', diplomacy: '외교', recruit: '등용',
};

export const PERSONALITY_NAME: Record<string, string> = { aggressive: '호전적', defensive: '수비적', diplomatic: '외교적', balanced: '균형' };

/** 하위 호환: 예전 StatBar 이름 */
export function StatBar({ value, max = 100 }: { value: number; max?: number; color?: string }) {
  return <Bar value={value} max={max} />;
}
