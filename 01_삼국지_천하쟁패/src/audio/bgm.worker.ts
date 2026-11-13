/** BGM 합성 전용 작업자: 곡 하나에 1~2초 걸리므로 화면이 멈추지 않게 뒤에서 만든다 */
import { songToSpec } from './score';
import { render } from './synth';
import { SONGS, type BgmId, type StingerId } from './tracks';

interface Req {
  id: BgmId | StingerId;
  sr: number;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Req>) => void) | null;
  postMessage(msg: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (e) => {
  const { id, sr } = e.data;
  const r = render(songToSpec(SONGS[id], sr));
  scope.postMessage({ id, left: r.left, right: r.right }, [r.left.buffer, r.right.buffer]);
};
