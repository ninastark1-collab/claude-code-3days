import type { Entity, EntityKind, GameEvent, GameState, Phase, PlayerId, PlayerState } from "./types";

/**
 * Network protocol shared by server and client.
 * The server runs the simulation and sends each player a per-seat snapshot every tick
 * (the opponent's hand and mana are never sent).
 */

export const ROOM_NAME = "battle";

export interface DeployMessage { handIndex: number; x: number; y: number }

const KINDS: EntityKind[] = ["unit", "building", "tower"];

/** [id, owner, kind, cardId, x, y, hp, maxHp, radius, air, deploying, lane] */
export type EntTuple = [number, PlayerId, number, string, number, number, number, number, number, 0 | 1, 0 | 1, -1 | 0 | 1];

export interface Snapshot {
  tick: number;
  time: number;
  phase: Phase;
  winner: PlayerId | "draw" | null;
  ents: EntTuple[];
  prs: [number, number, number, string][]; // x, y, isSplash, shooter cardId
  me: { mana: number; hand: string[]; next: string; crowns: number };
  oppCrowns: number;
  events: GameEvent[];
  /** Seconds until the match starts (0 once running). */
  countdown: number;
  /** Opponent connection: null = connected, otherwise seconds left to reconnect. */
  oppGrace: number | null;
}

export interface SnapshotExtras { countdown: number; oppGrace: number | null }

const r2 = (v: number) => Math.round(v * 100) / 100;

export function makeSnapshot(state: GameState, seat: PlayerId, extras: SnapshotExtras = { countdown: 0, oppGrace: null }): Snapshot {
  const me = state.players[seat];
  const opp = state.players[seat === 0 ? 1 : 0];
  return {
    tick: state.tick,
    time: r2(state.time),
    phase: state.phase,
    winner: state.winner,
    ents: state.entities.map((e) => [
      e.id, e.owner, KINDS.indexOf(e.kind), e.cardId, r2(e.x), r2(e.y), Math.ceil(e.hp), e.maxHp,
      e.radius, e.air ? 1 : 0, e.deployTimer > 0 ? 1 : 0, e.lane,
    ]),
    prs: state.projectiles.map((p) => [r2(p.x), r2(p.y), p.splash > 0 ? 1 : 0, p.src]),
    me: { mana: r2(me.mana), hand: [...me.hand], next: me.next, crowns: me.crowns },
    oppCrowns: opp.crowns,
    events: state.events,
    countdown: Math.max(0, Math.round(extras.countdown * 100) / 100),
    oppGrace: extras.oppGrace === null ? null : Math.ceil(extras.oppGrace),
  };
}

/**
 * Rebuild a GameState-shaped object from a snapshot so the client can reuse the same
 * rendering / deploy-zone code as offline mode. Previous positions are carried over
 * from `prev` (by entity id) for interpolation.
 */
export function stateFromSnapshot(prev: GameState | null, snap: Snapshot, seat: PlayerId): GameState {
  const prevById = new Map(prev?.entities.map((e) => [e.id, e]) ?? []);
  const entities: Entity[] = snap.ents.map(([id, owner, kind, cardId, x, y, hp, maxHp, radius, air, deploying, lane]) => {
    const p = prevById.get(id);
    return {
      id, owner, kind: KINDS[kind], cardId, lane, x, y, px: p ? p.x : x, py: p ? p.y : y, hp, maxHp, radius,
      speed: 0, range: 0, damage: 0, hitSpeed: 1, cooldown: 0, air: air === 1, targetsAir: false,
      buildingsOnly: false, splash: 0, lifetime: 0, deployTimer: deploying ? 1 : 0, targetId: null,
    };
  });
  const mine: PlayerState = { mana: snap.me.mana, hand: snap.me.hand, next: snap.me.next, queue: [], crowns: snap.me.crowns };
  const theirs: PlayerState = { mana: 0, hand: [], next: "", queue: [], crowns: snap.oppCrowns };
  return {
    tick: snap.tick,
    time: snap.time,
    phase: snap.phase,
    winner: snap.winner,
    entities,
    projectiles: snap.prs.map(([x, y, s, src], i) => ({
      id: i, owner: 0, x, y, tx: x, ty: y, targetId: 0, damage: 0, splash: s, speed: 0, targetsAir: false, src,
    })),
    players: seat === 0 ? [mine, theirs] : [theirs, mine],
    events: snap.events,
    nextId: 0,
    rng: 0,
  };
}

/** Validate an untrusted deploy message from a client. */
export function parseDeploy(msg: unknown): DeployMessage | null {
  if (!msg || typeof msg !== "object") return null;
  const { handIndex, x, y } = msg as Record<string, unknown>;
  if (!Number.isInteger(handIndex) || (handIndex as number) < 0 || (handIndex as number) > 3) return null;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { handIndex: handIndex as number, x, y };
}
