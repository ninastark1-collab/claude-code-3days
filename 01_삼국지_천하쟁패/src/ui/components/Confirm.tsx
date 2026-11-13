import type { ReactNode } from 'react';
import { Btn, Modal } from '../common';

/**
 * 되돌릴 수 없는 행동 확인창 (QA-DEV-09). 기존 "다음 달로 넘어갈까요?" 확인창과 같은 모양:
 * 왼쪽 = 물러서기, 오른쪽 붉은 버튼 = 실행.
 */
export const CONFIRM_TEXT = {
  quit: { title: '타이틀로 나갈까요?', body: '마지막으로 저장한 뒤의 진행은 남지 않습니다.', cancel: '계속하기', ok: '나가기' },
  overwrite: { title: '이 칸에 덮어쓸까요?', body: '이 칸에 있던 저장은 지워지고, 지금 진행이 그 자리에 저장됩니다.', cancel: '그만두기', ok: '덮어쓰기' },
} as const;

/** 저장 시각 → "12분 전" */
export function agoText(t: number, now = Date.now()): string {
  const m = Math.round((now - t) / 60000);
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
}

export function ConfirmModal(props: {
  kind: keyof typeof CONFIRM_TEXT;
  detail?: ReactNode;
  onCancel: () => void;
  onOk: () => void;
  /** 금색 주 버튼 (예: 저장하고 나가기) */
  primary?: { label: string; onClick: () => void };
}) {
  const t = CONFIRM_TEXT[props.kind];
  return (
    <Modal
      title={t.title}
      onClose={props.onCancel}
      footer={
        <>
          <Btn onClick={props.onCancel}>{t.cancel}</Btn>
          <Btn kind="red" onClick={props.onOk}>
            {t.ok}
          </Btn>
          {props.primary && (
            <Btn kind="primary" onClick={props.primary.onClick}>
              {props.primary.label}
            </Btn>
          )}
        </>
      }
    >
      {props.detail && <div className="small">{props.detail}</div>}
      <p className="muted" style={{ margin: 0 }}>
        {t.body}
      </p>
    </Modal>
  );
}
