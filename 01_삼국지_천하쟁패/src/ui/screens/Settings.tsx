import { useState } from 'react';
import { quality3DSetting, setQuality3D } from '../render3d/support';
import { Btn } from '../common';
import { AboutModal } from '../components/About';
import { ConfirmModal, agoText } from '../components/Confirm';
import { autoSave, listSaves } from '../../engine/save';
import { getSfxVolume, setSfxVolume, sfx } from '../sound';
import { HelpModal } from '../components/Help';
import { SaveLoadModal } from '../components/SaveLoad';
import { getBgmVolume, isBgmMuted, setBgmMuted, setBgmVolume } from '../../audio/bgm';
import { useSettings } from '../settings';
import { useStore } from '../store';

/**
 * S17 설정: 접근성을 맨 앞에. 바꾸면 뒤 화면에 바로 반영된다.
 * 엔진에 없는 항목(연출 등급, 진동)은 넣지 않았다.
 */
export function SettingsScreen() {
  const [q3d, setQ3d] = useState(quality3DSetting());
  const [bgmMuted, setBgmMutedUi] = useState(isBgmMuted());
  const [bgmVol, setBgmVol] = useState(getBgmVolume());
  const [sfxVol, setSfxVol] = useState(getSfxVolume());
  const [lastSave, setLastSave] = useState('');
  const s = useSettings();
  const { open, g, quitToTitle, go } = useStore();
  const [cat, setCat] = useState<'view' | 'sound' | 'play' | 'save'>('view');
  const [modal, setModal] = useState<'save' | 'load' | 'help' | 'about' | 'quit' | null>(null);
  const close = () => (g ? open(null) : go('title'));
  const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
    <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
  );
  return (
    <div className="screen" style={{ zIndex: 30, background: 'var(--g-lacquer-solid)' }}>
      <div className="abs set-nav" style={{ left: 0, top: 0, bottom: 0, width: 200, padding: '16px 12px 16px var(--sa)', background: 'var(--g-lacquer-2)', display: 'grid', gap: 4, alignContent: 'start' }}>
        <div className="disp" style={{ fontSize: 'var(--fs-h2)', marginBottom: 8 }}>
          설정
        </div>
        {(
          [
            ['view', '보기 · 접근성'],
            ['sound', '소리'],
            ['play', '게임 진행'],
            ['save', '저장 · 도움말'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>
            {l}
          </button>
        ))}
      </div>
      <button className="back abs" style={{ right: 'var(--sa)', top: 14 }} onClick={close} aria-label="닫기">
        ✕
      </button>
      <div className="abs scroll" style={{ left: 222, right: 'calc(var(--sa) + 48px)', top: 14, bottom: 14, display: 'grid', gap: 2, alignContent: 'start' }}>
        {cat === 'view' && (
          <>
            <div className="set-row">
              <span>
                3D 화질 <span className="dim small">자동은 기기를 재서 고른다. 고급·보통·절약</span>
              </span>
              <span className="seg">
                {(
                  [
                    ['auto', '자동'],
                    ['high', '고급'],
                    ['normal', '보통'],
                    ['saver', '절약'],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} className={q3d === k ? 'on' : ''} onClick={() => (setQuality3D(k), setQ3d(k))}>
                    {l}
                  </button>
                ))}
              </span>
            </div>
            <div className="set-row">
              <span>글자 크기</span>
              <span className="seg">
                {(
                  [
                    ['small', '작게'],
                    ['normal', '보통'],
                    ['large', '크게'],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} className={s.fontSize === k ? 'on' : ''} onClick={() => s.set('fontSize', k)}>
                    {l}
                  </button>
                ))}
              </span>
            </div>
            <div className="set-row">
              <span>
                색약 모드 <span className="dim small">세력 색에 점·빗금·격자 무늬를 더한다</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'flex', gap: 3 }}>
                  <i className="sl" style={{ width: 18, height: 18, background: 'repeating-linear-gradient(45deg,var(--f-ma) 0 3px,var(--f-lijue) 3px 6px)' }} />
                  <i className="sl" style={{ width: 18, height: 18, background: 'radial-gradient(circle,var(--g-ink) 1.5px,var(--f-lubu) 2px) 0 0/6px 6px' }} />
                </span>
                <Toggle on={s.colorBlind} onChange={(v) => s.set('colorBlind', v)} label="색약 모드" />
              </span>
            </div>
            <div className="set-row">
              <span>한자 병기 (도시 이름 옆)</span>
              <Toggle on={s.showHanja} onChange={(v) => s.set('showHanja', v)} label="한자 병기" />
            </div>
            <div className="set-row">
              <span>연호에 서기 함께 표시</span>
              <Toggle on={s.showAD} onChange={(v) => s.set('showAD', v)} label="서기 표시" />
            </div>
          </>
        )}
        {cat === 'sound' && (
          <>
            {(
              [
                ['배경음', !bgmMuted, (on: boolean) => (setBgmMuted(!on), setBgmMutedUi(!on)), bgmVol, (v: number) => (setBgmVolume(v), setBgmVol(v)), undefined],
                ['효과음', !s.muted, (on: boolean) => s.set('muted', !on), sfxVol, (v: number) => (setSfxVolume(v), setSfxVol(v)), () => sfx('click')],
              ] as const
            ).map(([name, on, setOn, vol, setVol, preview]) => (
              <div className="set-row" key={name}>
                <span>{name}</span>
                <span className={`vol ${on ? '' : 'off'}`}>
                  <Toggle on={on} onChange={setOn} label={name} />
                  <input
                    type="range"
                    className="vol-range"
                    min={0}
                    max={100}
                    value={Math.round(vol * 100)}
                    aria-label={`${name} 크기`}
                    aria-valuetext={String(Math.round(vol * 100))}
                    disabled={!on}
                    style={{ ['--p' as string]: `${Math.round(vol * 100)}%` }}
                    onChange={(e) => setVol(Number(e.target.value) / 100)}
                    onPointerUp={preview}
                    onKeyUp={preview}
                  />
                  <em>{Math.round(vol * 100)}</em>
                </span>
              </div>
            ))}
          </>
        )}
        {cat === 'play' && (
          <div className="set-row">
            <span>전투 기본 속도</span>
            <span className="seg">
              {(
                [
                  [1, '느리게'],
                  [2, '보통'],
                  [3, '빠르게'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={s.battleSpeed === k ? 'on' : ''} onClick={() => s.set('battleSpeed', k)}>
                  {l}
                </button>
              ))}
            </span>
          </div>
        )}
        {cat === 'save' && (
          <div style={{ display: 'grid', gap: 8, maxWidth: 320, marginTop: 6 }}>
            {g && <Btn onClick={() => setModal('save')}>저장</Btn>}
            <Btn onClick={() => setModal('load')}>불러오기</Btn>
            <Btn onClick={() => setModal('help')}>게임 방법</Btn>
            <Btn onClick={() => setModal('about')}>정보 · 라이선스</Btn>
            {g && (
              <Btn
                kind="danger"
                onClick={async () => {
                  const metas = (await listSaves()).filter((r) => r.meta).map((r) => r.meta!);
                  const m = metas.sort((a, b) => b.savedAt - a.savedAt)[0];
                  setLastSave(m ? `마지막 저장 · ${m.date} (${agoText(m.savedAt)})` : '아직 저장하지 않았습니다');
                  setModal('quit');
                }}
              >
                타이틀로
              </Btn>
            )}
          </div>
        )}
      </div>
      {(modal === 'save' || modal === 'load') && <SaveLoadModal mode={modal} onClose={() => setModal(null)} />}
      {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
      {modal === 'about' && <AboutModal onClose={() => setModal(null)} />}
      {modal === 'quit' && (
        <ConfirmModal
          kind="quit"
          detail={lastSave}
          onCancel={() => setModal(null)}
          onOk={quitToTitle}
          primary={{
            label: '저장하고 나가기',
            onClick: async () => {
              if (g) await autoSave(g.s, g.s.factions[g.s.playerFaction]!.name).catch(() => undefined);
              quitToTitle();
            },
          }}
        />
      )}
    </div>
  );
}
