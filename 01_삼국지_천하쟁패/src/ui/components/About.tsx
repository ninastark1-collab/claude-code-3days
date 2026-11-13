import { useState } from 'react';
import { APP_VERSION } from '../../version';
import { Modal } from '../common';
import ibm from '../../../assets/fonts/LICENSE-ibm-plex-sans-kr.txt?raw';
import noto from '../../../assets/fonts/LICENSE-noto-serif-kr.txt?raw';
import song from '../../../assets/fonts/LICENSE-song-myung.txt?raw';

/** 정보·라이선스 (QA-DEV-05): 게임 버전, 사용한 글꼴과 SIL OFL 1.1 전문. 같은 파일이 배포본 licenses/ 에도 들어간다 */
export const FONT_LICENSES: { name: string; use: string; text: string }[] = [
  { name: 'Song Myung', use: '제목 글꼴', text: song },
  { name: 'Noto Serif KR', use: '본문 명조', text: noto },
  { name: 'IBM Plex Sans KR', use: '수치·작은 글자', text: ibm },
];

export function AboutModal({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Modal title="정보 · 라이선스" onClose={onClose} width={620}>
      <div className="small">
        삼국지 천하쟁패 v{APP_VERSION}
        <br />
        <span className="dim">나관중 『삼국지연의』(공유 저작물)에 기초한 창작 게임입니다.</span>
      </div>
      <div className="small" style={{ marginTop: 6 }}>
        이 게임은 아래 글꼴을 SIL Open Font License 1.1 에 따라 사용합니다.
      </div>
      {FONT_LICENSES.map((f) => (
        <div key={f.name}>
          <button className="btn sm" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => setOpen(open === f.name ? null : f.name)}>
            <span>
              {f.name} <span className="dim">· {f.use}</span>
            </span>
            <span className="dim">{open === f.name ? '접기' : '전문 보기'}</span>
          </button>
          {open === f.name && <pre className="license-text">{f.text}</pre>}
        </div>
      ))}
    </Modal>
  );
}
