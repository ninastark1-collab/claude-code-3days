import { Component, type ReactNode } from 'react';
import { latestAutoSlot } from '../engine/save';
import { APP_VERSION } from '../version';
import { logError, type ErrorEntry } from './errorLog';
import { useStore } from './store';

/**
 * 오류 화면 (QA-DEV-02): 렌더 중 예외, 또는 게임 진행 중 잡히지 않은 예외가 나면 흰 화면 대신 이 화면을 띄운다.
 * "자동 저장에서 이어하기 / 타이틀로" 두 길을 주고, 내용·버전은 errorLog 에 남긴다.
 */
const FATAL = 'samgukji:fatal';

/** 잡히지 않은 예외를 오류 화면으로 보낸다. main.tsx 에서 한 번 부른다 */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (ev) => {
    // 이미지·스크립트 불러오기 실패(ev.error 없음)와 브라우저 경고성 오류는 기록만
    if (!ev.error || /ResizeObserver/.test(ev.message)) return;
    window.dispatchEvent(new CustomEvent(FATAL, { detail: logError('window.onerror', ev.error) }));
  });
  window.addEventListener('unhandledrejection', (ev) => {
    // 비동기 실패(저장 실패 등)는 각자 안내하므로, 잡히지 않은 것은 기록만 하고 진행은 막지 않는다
    logError('unhandledrejection', ev.reason);
  });
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { err: ErrorEntry | null; busy: boolean; note: string }> {
  state = { err: null as ErrorEntry | null, busy: false, note: '' };
  private onFatal = (ev: Event) => this.setState({ err: (ev as CustomEvent<ErrorEntry>).detail });
  componentDidMount() {
    window.addEventListener(FATAL, this.onFatal);
  }
  componentWillUnmount() {
    window.removeEventListener(FATAL, this.onFatal);
  }
  componentDidCatch(error: unknown) {
    this.setState({ err: logError('render', error) });
  }
  static getDerivedStateFromError() {
    return null;
  }
  private resume = async () => {
    this.setState({ busy: true, note: '' });
    try {
      const slot = await latestAutoSlot();
      if (!slot) return this.setState({ busy: false, note: '자동 저장이 없습니다. 타이틀로 돌아가 주세요.' });
      useStore.getState().quitToTitle();
      const err = await useStore.getState().load(slot);
      if (err) return this.setState({ busy: false, note: err });
      useStore.setState({ busy: false });
      this.setState({ err: null, busy: false });
    } catch (e) {
      logError('resume', e);
      this.setState({ busy: false, note: '자동 저장을 불러오지 못했습니다. 타이틀로 돌아가 주세요.' });
    }
  };
  private toTitle = () => {
    useStore.getState().quitToTitle();
    useStore.setState({ busy: false });
    this.setState({ err: null, note: '' });
  };
  render() {
    const { err, busy, note } = this.state;
    if (!err) return this.props.children;
    return (
      <div className="screen err-screen" role="alertdialog" aria-label="오류">
        <div className="err-box">
          <div className="disp" style={{ fontSize: 20 }}>
            문제가 생겨 진행을 멈췄습니다
          </div>
          <div className="dim small" style={{ marginTop: 6 }}>
            마지막 자동 저장에서 이어 가거나 타이틀로 돌아갈 수 있습니다. 오류 내용은 기기에 기록되었습니다.
          </div>
          <div className="err-msg micro">
            v{APP_VERSION} · {err.msg}
          </div>
          {note && <div className="small" style={{ color: 'var(--g-bad)' }}>{note}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <button className="btn pri" disabled={busy} onClick={this.resume}>
              자동 저장에서 이어하기
            </button>
            <button className="btn" disabled={busy} onClick={this.toTitle}>
              타이틀로
            </button>
          </div>
        </div>
      </div>
    );
  }
}
