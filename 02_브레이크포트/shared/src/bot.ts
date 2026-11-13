import { getCard } from "./cards";
import { ARENA_W, DT, MANA_MAX } from "./constants";
import { canDeploy, flipY } from "./sim";
import type { GameState, PlayerId } from "./types";

export interface BotAction { handIndex: number; x: number; y: number }
export type BotDifficulty = "easy" | "normal" | "hard";

const PROFILES: Record<BotDifficulty, { interval: number; saveMin: number; saveRange: number; defendChance: number; clump: number }> = {
  easy: { interval: 1.2, saveMin: 7.5, saveRange: 2.5, defendChance: 0.55, clump: 4 },
  normal: { interval: 0.6, saveMin: 5, saveRange: 3, defendChance: 1, clump: 3 },
  hard: { interval: 0.35, saveMin: 4, saveRange: 2, defendChance: 1, clump: 2 },
};

/**
 * Simple opponent:
 *  - defends against enemy units on its half (fireball on clumps),
 *  - otherwise builds pushes: a tank at the back, then support units following it in the same lane,
 *  - finishes low towers with fireball and never sits on full mana.
 */
export class Bot {
  private timer = 0;
  private readonly profile: (typeof PROFILES)[BotDifficulty];
  private saveUntil: number;
  private pushLane: number | null = null; // x of the lane being pushed
  private pushUntil = 0; // game time until which follow-ups go to pushLane

  /** `rng` can be seeded for reproducible tests; defaults to Math.random. */
  constructor(readonly player: PlayerId, readonly difficulty: BotDifficulty = "normal", private rng: () => number = Math.random) {
    this.profile = PROFILES[difficulty];
    this.saveUntil = this.profile.saveMin + this.rng() * this.profile.saveRange;
  }

  think(state: GameState): BotAction | null {
    this.timer -= DT;
    if (this.timer > 0 || state.phase === "ended") return null;
    this.timer = this.profile.interval;
    const p = this.player;
    const me = state.players[p];
    const playable = me.hand
      .map((id, i) => ({ i, card: getCard(id) }))
      .filter((c) => c.card.cost <= me.mana);
    if (!playable.length) return null;
    const pick = <T>(arr: T[]) => arr[Math.floor(this.rng() * arr.length)];
    const ok = (a: BotAction) => (canDeploy(state, p, a.handIndex, a.x, a.y).ok ? a : null);

    // ----- defend: enemy units on (or approaching) my half -----
    const threats = state.entities.filter((e) => e.owner !== p && e.kind === "unit" && flipY(e.y, p) >= 12);
    if (threats.length && this.rng() < this.profile.defendChance) {
      const fb = playable.find((c) => c.card.type === "spell");
      if (fb && threats.length >= this.profile.clump) {
        const cx = threats.reduce((s, t) => s + t.x, 0) / threats.length;
        const cy = threats.reduce((s, t) => s + t.y, 0) / threats.length;
        return { handIndex: fb.i, x: cx, y: cy };
      }
      // prefer a card that can actually hit the threat (anti-air vs flyers)
      const anyAir = threats.some((t) => t.air);
      let units = playable.filter((c) => c.card.type !== "spell");
      const fitting = units.filter((c) => !anyAir || c.card.targetsAir);
      if (fitting.length && this.difficulty !== "easy") units = fitting;
      if (units.length) {
        const c = pick(units);
        const t = threats[0];
        const x = Math.min(ARENA_W - 1, Math.max(1, t.x));
        const y = flipY(Math.max(18, Math.min(29, flipY(t.y, p) + 2)), p);
        const a = ok({ handIndex: c.i, x, y });
        if (a) { this.pushLane = x < ARENA_W / 2 ? 3.5 : 14.5; this.pushUntil = state.time + 8; } // counter-push
        return a;
      }
      return null;
    }

    // ----- finish a low enemy tower with fireball -----
    const fb = playable.find((c) => c.card.type === "spell");
    if (fb) {
      const target = state.entities.find((e) => e.owner !== p && e.kind === "tower" && e.hp <= fb.card.damage * (fb.card.towerDamagePct ?? 1));
      if (target) return { handIndex: fb.i, x: target.x, y: target.y };
    }

    // ----- follow up an ongoing push with support units -----
    const units = playable.filter((c) => c.card.type === "unit");
    if (this.pushLane !== null && state.time < this.pushUntil && units.length) {
      const support = units.filter((c) => c.card.cost <= 4);
      if (support.length && me.mana >= 3) {
        const a = ok({ handIndex: pick(support).i, x: this.pushLane, y: flipY(25, p) });
        if (a) return a;
      }
    }

    // ----- start a new push when mana is high (never waste mana at the cap) -----
    if (me.mana < this.saveUntil && me.mana < MANA_MAX - 0.2) return null;
    const c = pick(playable.filter((c) => c.card.type !== "spell").length ? playable.filter((c) => c.card.type !== "spell") : playable);
    this.saveUntil = this.profile.saveMin + this.rng() * this.profile.saveRange;
    const lane = this.rng() < 0.5 ? 3.5 : 14.5;
    let x = lane, fy = 18.5;
    if (c.card.type === "spell") {
      const tower = state.entities.find((e) => e.owner !== p && e.kind === "tower" && e.lane === (lane < 9 ? 0 : 1));
      if (!tower) return null;
      return { handIndex: c.i, x: tower.x, y: tower.y };
    }
    if (c.card.type === "building") { x = 9; fy = 22; }
    else if (c.card.cost >= 5) fy = 27; // tank starts at the back, support joins later
    const a = ok({ handIndex: c.i, x, y: flipY(fy, p) });
    if (a && c.card.type === "unit") { this.pushLane = lane; this.pushUntil = state.time + (c.card.cost >= 5 ? 12 : 6); }
    return a;
  }
}
