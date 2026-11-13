/**
 * 시드 기반 난수 (mulberry32). 상태는 holder.rngState 숫자 하나에 저장되므로
 * GameState에 그대로 들어가 세이브/로드 후에도 같은 수열이 이어진다.
 */
export class Rng {
  constructor(private holder: { rngState: number }) {}

  /** 0 이상 1 미만 */
  next(): number {
    let t = (this.holder.rngState = (this.holder.rngState + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** min 이상 max 이하 정수 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** percent% 확률로 true */
  chance(percent: number): boolean {
    return this.next() * 100 < percent;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('빈 배열에서 선택할 수 없음');
    return items[Math.floor(this.next() * items.length)]!;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}
