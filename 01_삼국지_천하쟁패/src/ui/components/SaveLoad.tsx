import { useEffect, useState } from 'react';
import { MANUAL_SLOTS, SLOT_LABEL, listSaves, saveLocation, type SaveMeta, type SlotId } from '../../engine/save';
import { Btn, Modal } from '../common';
import { ConfirmModal } from './Confirm';
import { useStore } from '../store';

type Row = { slot: SlotId; meta: SaveMeta | null; error?: string };

export function SaveLoadModal({ mode, onClose }: { mode: 'save' | 'load'; onClose: () => void }) {
  const { save, load, toast } = useStore();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dir, setDir] = useState<string | null>(null);
  /** 덮어쓰기 확인을 기다리는 칸 (QA-DEV-09) */
  const [ask, setAsk] = useState<Row | null>(null);
  const refresh = () => listSaves().then(setRows);
  useEffect(() => {
    refresh();
    saveLocation().then(setDir);
  }, []);
  const visible = (rows ?? []).filter((r) => mode === 'load' || (MANUAL_SLOTS as readonly string[]).includes(r.slot));
  return (
    <Modal title={mode === 'save' ? '저장' : '불러오기'} onClose={onClose} width={520}>
      {!rows && <p className="muted">읽는 중…</p>}
      <div className="slots">
        {visible.map((r) => (
          <div key={r.slot} className="slot">
            <div>
              <b>{SLOT_LABEL[r.slot]}</b>
              <div className={r.error ? 'bad small' : 'muted'}>
                {r.error
                  ? r.error
                  : r.meta
                    ? `${r.meta.label} · ${r.meta.date}${r.meta.inBattle ? ' · 전투 중' : ''} · ${new Date(r.meta.savedAt).toLocaleString('ko-KR')}`
                    : '비어 있음'}
              </div>
            </div>
            {mode === 'save' ? (
              <Btn small onClick={() => (r.meta ? setAsk(r) : save(r.slot).then(refresh))}>
                저장
              </Btn>
            ) : (
              <Btn
                small
                disabled={!r.meta}
                onClick={async () => {
                  const err = await load(r.slot);
                  if (err) toast(err, false);
                  else onClose();
                }}
              >
                불러오기
              </Btn>
            )}
          </div>
        ))}
      </div>
      {dir && <p className="muted tiny">저장 위치: {dir}</p>}
      {ask?.meta && (
        <ConfirmModal
          kind="overwrite"
          detail={`${SLOT_LABEL[ask.slot]} · ${ask.meta.date} · ${ask.meta.label}${ask.meta.cities !== undefined ? ` · 도시 ${ask.meta.cities}` : ''}`}
          onCancel={() => setAsk(null)}
          onOk={() => {
            const slot = ask.slot;
            setAsk(null);
            save(slot).then(refresh);
          }}
        />
      )}
    </Modal>
  );
}
