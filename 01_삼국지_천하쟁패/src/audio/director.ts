/**
 * BGM 감독: 게임 상태를 보고 알맞은 곡을 고른다.
 *
 * 연결은 한 줄:  main.tsx 에서 startBgmDirector()
 * 일기토 장면만 화면 내부 상태라 Battle.tsx 에서 setBgmDuel(true/false) 를 불러 준다.
 *
 * 엔진이 상태를 제자리에서 바꾸는 경우(전투 결과, 메시지 추가)가 있어 구독 대신 0.25초마다 살펴본다.
 * 곡 고르는 규칙은 cues.ts 의 pickBgm (순수 함수, tests/bgm.test.ts). 큐 전체 표는 `음향_BGM_큐시트.md`.
 */
import { useStore } from '../ui/store';
import { playStinger, preloadBgm, setBgm, type BgmId, type StingerId } from './bgm';
import { castleEngaged, pickBgm, type BgmSnapshot } from './cues';

/** 다음에 나올 법한 곡 (미리 합성) */
const NEXT: Partial<Record<BgmId, (BgmId | StingerId)[]>> = {
  title: ['prologue'],
  prologue: ['map_peace'],
  map_peace: ['council', 'city', 'st_event'],
  map_war: ['council', 'st_alarm'],
  council: ['battle', 'siege'],
  battle: ['st_duel', 'duel', 'st_victory', 'result_win'],
  siege: ['st_duel', 'duel', 'st_victory', 'result_win'],
};

let duelOn = false;
/** Battle.tsx 일기토 장면이 열릴 때 true, 닫힐 때 false */
export function setBgmDuel(on: boolean): void {
  duelOn = on;
}

let started = false;

export function startBgmDirector(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  let lastCue: BgmId | null = null;
  let lastMonth = -1;
  let lastBattleAt = -99;
  let hadIncoming = false;
  let siegeOf: object | null = null;
  const seen = new WeakSet<object>();

  const tick = () => {
    const st = useStore.getState();
    const g = st.g;
    const now = g ? g.s.year * 12 + g.s.month : 0;
    if (st.screen === 'battle') lastBattleAt = now;
    // 공성 곡은 성에 붙은 순간부터 그 전투가 끝날 때까지
    const b = st.battle;
    if (b && b.started !== false && siegeOf !== b && castleEngaged(b)) siegeOf = b;

    const snap: BgmSnapshot = {
      screen: st.screen,
      overlay: st.overlay?.kind ?? null,
      battle: st.battle,
      ending: g?.s.ending?.type ?? null,
      atWar: !!st.incoming || (!!g && now - lastBattleAt <= 2),
      duel: duelOn,
      siege: !!b && siegeOf === b,
    };
    const cue = pickBgm(snap);

    // 장면이 바뀌는 순간에만 효과 음악을 끼운다
    if (cue !== lastCue) {
      if (cue === 'duel') playStinger('st_duel', 'duel');
      else if (cue === 'result_win') playStinger('st_victory', 'result_win');
      else if (cue === 'result_lose') playStinger('st_defeat', 'result_lose');
      else setBgm(cue);
      if (cue) preloadBgm(NEXT[cue] ?? []);
      lastCue = cue;
    }

    if (st.screen === 'strategy' && g) {
      // 새 계절 (1·4·7·10월)
      if (lastMonth !== -1 && now !== lastMonth && [1, 4, 7, 10].includes(g.s.month)) playStinger('st_season');
      lastMonth = now;
      // 적 침공
      if (st.incoming && !hadIncoming) playStinger('st_alarm');
      // 역사 이벤트 · 장수 사망 (팝업으로 뜨는 메시지)
      let event = false;
      let death = false;
      for (const m of g.s.messages) {
        if (seen.has(m)) continue;
        seen.add(m);
        if (m.kind === 'event') event = true;
        if (m.kind === 'death') death = true;
      }
      if (event) playStinger('st_event');
      else if (death) playStinger('st_death');
    } else if (g) {
      // 전략 화면 밖에서 쌓인 메시지는 돌아왔을 때 울리지 않는다
      for (const m of g.s.messages) seen.add(m);
      lastMonth = now;
    }
    hadIncoming = !!st.incoming;
  };

  tick();
  setInterval(tick, 250);
}
