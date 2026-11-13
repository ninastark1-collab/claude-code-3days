import { useEffect, useState } from 'react';
import { AUTO_SLOTS, listSaves, type SaveMeta } from '../../engine/save';
import { canQuit, quitApp } from '../../platform';
import { APP_VERSION } from '../../version';
import { Btn } from '../common';
import { InkCanvas } from '../components/Ink';
import { SaveLoadModal } from '../components/SaveLoad';
import { useStore } from '../store';

/** S01 타이틀: 이어하기를 가장 크게, 마지막 자동 저장의 날짜와 세력을 보여 준다 */
export function TitleScreen() {
  const { go, load, toast, open, data } = useStore();
  const [modal, setModal] = useState<'load' | null>(null);
  const [last, setLast] = useState<SaveMeta | null>(null);
  useEffect(() => {
    listSaves().then((rows) => {
      const metas = rows.filter((r) => r.meta).map((r) => r.meta!) as SaveMeta[];
      metas.sort((a, b) => b.savedAt - a.savedAt);
      setLast(metas[0] ?? null);
    });
  }, []);
  const ago = (t: number) => {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
  };
  return (
    <div className="screen">
      <InkCanvas seed={3} />
      <div className="abs" style={{ left: 'var(--sa)', top: 56 }}>
        <div className="hz" style={{ fontSize: 86, lineHeight: 0.95, letterSpacing: '.04em' }}>
          三國
        </div>
        <div className="disp" style={{ fontSize: 22, marginTop: 10 }}>
          삼국지 천하쟁패
        </div>
        <div className="dim small" style={{ marginTop: 4 }}>
          나관중 『삼국지연의』에 기초한 전략 시뮬레이션
        </div>
      </div>
      <div
        className="abs"
        style={{
          right: 'var(--sa)',
          top: 50,
          width: 290,
          display: 'grid',
          gap: 8,
        }}
      >
        {/* 세이브가 없으면 이어하기를 숨기고 새 게임이 주 버튼 (QA-DSN-05) */}
        {last && (
          <Btn
            kind="primary"
            style={{
              height: 64,
              justifyContent: 'space-between',
              padding: '0 18px',
            }}
            onClick={async () => {
              if (!last) return;
              const err = await load(last.slot);
              if (err) toast(err, false);
            }}
          >
            <span className="disp" style={{ fontSize: 17 }}>
              이어하기
            </span>
            <span
              style={{
                fontSize: 'var(--fs-micro)',
                fontWeight: 500,
                textAlign: 'right',
                lineHeight: 1.3,
              }}
            >
              {last ? (
                <>
                  {last.label} · {last.date}
                  <br />
                  {(AUTO_SLOTS as readonly string[]).includes(last.slot) ? '자동 저장' : '수동 저장'} · {ago(last.savedAt)}
                </>
              ) : (
                '저장된 게임 없음'
              )}
            </span>
          </Btn>
        )}
        <Btn
          kind={last ? undefined : 'primary'}
          style={last ? { justifyContent: 'flex-start' } : { height: 64, justifyContent: 'flex-start', padding: '0 18px' }}
          onClick={() => go('newgame')}
        >
          <span className="disp" style={{ fontSize: last ? 16 : 17 }}>
            새 게임
          </span>
        </Btn>
        <Btn style={{ justifyContent: 'flex-start' }} onClick={() => setModal('load')}>
          <span className="disp" style={{ fontSize: 16 }}>
            불러오기
          </span>
        </Btn>
        {/* 종료: PC·안드로이드만. iOS·웹에서는 눌러도 아무 일이 없으므로 숨긴다 (QA-DEV-08) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: canQuit() ? '1fr 1fr' : '1fr',
            gap: 8,
          }}
        >
          <Btn onClick={() => open({ kind: 'settings' })}>
            <span className="disp" style={{ fontSize: 15 }}>
              설정
            </span>
          </Btn>
          {canQuit() && (
            <Btn onClick={quitApp}>
              <span className="disp" style={{ fontSize: 15 }}>
                종료
              </span>
            </Btn>
          )}
        </div>
      </div>
      <div className="abs dim micro" style={{ left: 'var(--sa)', bottom: 14 }}>
        v{APP_VERSION} · 무장 {data.officers.length}명 · 시나리오 {data.scenarios.length}
      </div>
      {modal === 'load' && <SaveLoadModal mode="load" onClose={() => setModal(null)} />}
    </div>
  );
}
