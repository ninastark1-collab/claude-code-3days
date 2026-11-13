/** 화면·상황 → BGM 고르기 (순수 함수). 표로 보려면 `음향_BGM_큐시트.md` */
import type { BgmId } from './tracks';

export interface BgmSnapshot {
  screen: string;
  overlay: string | null;
  battle: { auto?: boolean; started?: boolean; result?: { winner: string } | null; playerSide?: string | null } | null;
  ending: 'victory' | 'defeat' | null;
  /** 적 침공 대기 중이거나 최근 2개월 안에 전투가 있었다 */
  atWar: boolean;
  duel: boolean;
  /** 싸움이 성벽·성문에 붙었다 (castleEngaged, 한 번 붙으면 그 전투 끝까지 유지) */
  siege: boolean;
}

const WALL = new Set(['wall', 'gate']);
const COURT = new Set(['diplomacy', 'officers', 'officer', 'chronicle', 'factions']);

/**
 * 공격군이 성벽·성문 2칸 안에 들어왔는지, 성벽이 불타는지.
 * 지금 전장은 모두 성을 끼고 있어서, 성이 "있는지"가 아니라 성에 "붙었는지"로 야전/공성 곡을 가른다.
 */
export function castleEngaged(b: { w: number; tiles: { t: string; fire?: number }[]; units: { side: string; troops: number; x: number; y: number }[] }): boolean {
  const near: [number, number][] = [];
  b.tiles.forEach((t, i) => {
    if (!WALL.has(t.t)) return;
    if (t.fire) near.push([-99, -99]);
    near.push([i % b.w, Math.floor(i / b.w)]);
  });
  if (near.some(([x]) => x === -99)) return true;
  return b.units.some((u) => u.side === 'atk' && u.troops > 0 && near.some(([x, y]) => Math.max(Math.abs(u.x - x), Math.abs(u.y - y)) <= 2));
}

export function pickBgm(s: BgmSnapshot): BgmId | null {
  switch (s.screen) {
    case 'title':
      return 'title';
    case 'newgame':
    case 'lord':
      return 'prologue';
    case 'ending':
      return s.ending === 'defeat' ? 'ending_lose' : 'ending_win';
    case 'battle': {
      const b = s.battle;
      if (!b) return 'battle';
      if (s.duel) return 'duel';
      if (b.result) return b.result.winner === (b.playerSide ?? 'atk') ? 'result_win' : 'result_lose';
      if (b.auto && !b.started) return 'council';
      return s.siege ? 'siege' : 'battle';
    }
    case 'strategy':
      if (s.overlay === 'city3d') return 'city';
      if (s.overlay && COURT.has(s.overlay)) return 'court';
      return s.atWar ? 'map_war' : 'map_peace';
    default:
      return null; // 개발용 3D 확인 화면 등
  }
}
