import { getCard, TOWER_STATS, DEFAULT_DECK } from "./cards";
import {
  ARENA_H, ARENA_W, BRIDGES, BRIDGE_HALF, DEPLOY_EXPANDED_MIN_Y, DEPLOY_MIN_Y, DEPLOY_TIME,
  DOUBLE_MANA_AT, DT, MANA_MAX, MANA_PER_SEC, MANA_START, MATCH_TIME, MELEE_MAX_RANGE, OVERTIME,
  PROJECTILE_SPEED, RIVER_BOTTOM, RIVER_TOP, TOWER_LAYOUT, UNIT_SIGHT,
} from "./constants";
import { nextRandom } from "./rng";
import type { CardDef, DeployResult, Entity, GameState, PlayerId, PlayerState } from "./types";

// ---------- helpers ----------

/** Convert a y coordinate between world space and the given player's perspective (own base at bottom). */
export function flipY(y: number, p: PlayerId): number {
  return p === 0 ? y : ARENA_H - y;
}

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const edgeDist = (a: Entity, b: Entity) => dist(a.x, a.y, b.x, b.y) - a.radius - b.radius;

function random(state: GameState): number {
  const [v, next] = nextRandom(state.rng);
  state.rng = next;
  return v;
}

function shuffle<T>(state: GameState, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function baseEntity(state: GameState, owner: PlayerId, x: number, y: number): Entity {
  return {
    id: state.nextId++, owner, kind: "unit", cardId: "", lane: -1,
    x, y, px: x, py: y, hp: 1, maxHp: 1, radius: 0.5, speed: 0, range: 0, damage: 0,
    hitSpeed: 1, cooldown: 0, air: false, targetsAir: false, buildingsOnly: false,
    splash: 0, lifetime: 0, deployTimer: 0, targetId: null,
  };
}

// ---------- setup ----------

export function createGame(seed = 1, decks: [string[], string[]] = [DEFAULT_DECK, DEFAULT_DECK]): GameState {
  const state: GameState = {
    tick: 0, time: 0, phase: "playing", winner: null,
    entities: [], projectiles: [], events: [], nextId: 1, rng: seed | 0,
    players: [null, null] as unknown as [PlayerState, PlayerState],
  };
  for (const p of [0, 1] as PlayerId[]) {
    const deck = shuffle(state, decks[p]);
    state.players[p] = { mana: MANA_START, hand: deck.slice(0, 4), next: deck[4], queue: deck.slice(5), crowns: 0 };
    for (const t of TOWER_LAYOUT) {
      const s = TOWER_STATS[t.type];
      const e = baseEntity(state, p, t.x, flipY(t.y, p));
      Object.assign(e, {
        kind: "tower", cardId: `tower_${t.type}`, lane: t.lane, hp: s.hp, maxHp: s.hp,
        radius: s.radius, range: s.range, damage: s.damage, hitSpeed: s.hitSpeed, targetsAir: true,
      });
      state.entities.push(e);
    }
  }
  return state;
}

// ---------- deploy ----------

function sideTowerAlive(state: GameState, owner: PlayerId, lane: 0 | 1): boolean {
  return state.entities.some((e) => e.kind === "tower" && e.owner === owner && e.lane === lane && e.hp > 0);
}

/** Is (x, y) inside player p's deploy zone for units/buildings? */
export function inDeployZone(state: GameState, p: PlayerId, x: number, y: number): boolean {
  if (x < 0.5 || x > ARENA_W - 0.5) return false;
  const fy = flipY(y, p);
  if (fy > ARENA_H - 0.5) return false;
  if (fy >= DEPLOY_MIN_Y) return true;
  const lane = x < ARENA_W / 2 ? 0 : 1;
  return fy >= DEPLOY_EXPANDED_MIN_Y && !sideTowerAlive(state, other(p), lane);
}

export function canDeploy(state: GameState, p: PlayerId, handIndex: number, x: number, y: number): DeployResult {
  if (state.phase === "ended") return { ok: false, reason: "경기 종료" };
  const player = state.players[p];
  const cardId = player.hand[handIndex];
  if (!cardId) return { ok: false, reason: "잘못된 카드" };
  const card = getCard(cardId);
  if (player.mana < card.cost) return { ok: false, reason: "잉크 부족" };
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: "잘못된 위치" };
  if (card.type === "spell") {
    if (x < 0 || x > ARENA_W || y < 0 || y > ARENA_H) return { ok: false, reason: "전장 밖" };
    return { ok: true };
  }
  if (!inDeployZone(state, p, x, y)) return { ok: false, reason: "배치 불가 구역" };
  return { ok: true };
}

export function deploy(state: GameState, p: PlayerId, handIndex: number, x: number, y: number): DeployResult {
  const check = canDeploy(state, p, handIndex, x, y);
  if (!check.ok) return check;
  const player = state.players[p];
  const cardId = player.hand[handIndex];
  const card = getCard(cardId);
  player.mana -= card.cost;
  // cycle: played card goes to the back, "next" enters the hand
  player.hand[handIndex] = player.next;
  player.queue.push(cardId);
  player.next = player.queue.shift()!;

  if (card.type === "spell") castSpell(state, p, card, x, y);
  else spawnCard(state, p, card, x, y);
  state.events.push({ type: "deploy", x, y, cardId, owner: p });
  return { ok: true };
}

function spawnCard(state: GameState, p: PlayerId, card: CardDef, x: number, y: number) {
  const count = card.type === "building" ? 1 : card.count ?? 1;
  for (let i = 0; i < count; i++) {
    let ox = 0, oy = 0;
    if (count > 1) {
      const a = (i / count) * Math.PI * 2;
      ox = Math.cos(a) * 0.6;
      oy = Math.sin(a) * 0.6;
    }
    const e = baseEntity(state, p, clampX(x + ox), y + oy);
    Object.assign(e, {
      kind: card.type === "building" ? "building" : "unit",
      cardId: card.id, hp: card.hp ?? 1, maxHp: card.hp ?? 1, radius: card.radius ?? 0.5,
      speed: card.speed ?? 0, range: card.range ?? 0, damage: card.damage, hitSpeed: card.hitSpeed ?? 1,
      air: !!card.air, targetsAir: !!card.targetsAir, buildingsOnly: !!card.buildingsOnly,
      splash: card.splash ?? 0, lifetime: card.lifetime ?? 0, deployTimer: DEPLOY_TIME,
    });
    state.entities.push(e);
  }
}

function castSpell(state: GameState, p: PlayerId, card: CardDef, x: number, y: number) {
  const r = card.spellRadius ?? 2;
  for (const e of state.entities) {
    if (e.owner === p || e.hp <= 0) continue;
    if (dist(e.x, e.y, x, y) - e.radius > r) continue;
    e.hp -= e.kind === "tower" ? card.damage * (card.towerDamagePct ?? 1) : card.damage;
  }
  state.events.push({ type: "spell", x, y, radius: r, owner: p });
}

// ---------- targeting & movement ----------

function canTarget(e: Entity, t: Entity): boolean {
  if (t.owner === e.owner || t.hp <= 0) return false;
  if (e.buildingsOnly && t.kind === "unit") return false;
  if (t.air && !e.targetsAir) return false;
  return true;
}

function findTarget(state: GameState, e: Entity): Entity | null {
  const sight = e.kind === "unit" ? Math.max(UNIT_SIGHT, e.range) : e.range;
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const t of state.entities) {
    if (!canTarget(e, t)) continue;
    const d = edgeDist(e, t);
    if (d <= sight && d < bestD) { best = t; bestD = d; }
  }
  if (best || e.kind !== "unit") return best;
  // nothing nearby: march to the nearest enemy building / tower
  for (const t of state.entities) {
    if (t.kind === "unit" || !canTarget(e, t)) continue;
    const d = edgeDist(e, t);
    if (d < bestD) { best = t; bestD = d; }
  }
  return best;
}

const riverSide = (y: number) => (y < RIVER_TOP ? -1 : y > RIVER_BOTTOM ? 1 : 0);
const onBridge = (x: number) => BRIDGES.some((b) => Math.abs(x - b) <= BRIDGE_HALF);
const clampX = (x: number) => Math.min(ARENA_W - 0.3, Math.max(0.3, x));

/** Where a ground unit should walk next to eventually reach (tx, ty), using bridges to cross the river. */
function steer(e: Entity, tx: number, ty: number): [number, number] {
  if (e.air) return [tx, ty];
  const s = riverSide(e.y);
  const ts = riverSide(ty);
  if (s === ts) return [tx, ty];
  const bx = BRIDGES.reduce((a, b) =>
    Math.abs(e.x - b) + Math.abs(tx - b) < Math.abs(e.x - a) + Math.abs(tx - a) ? b : a);
  if (s !== 0) {
    if (Math.abs(e.x - bx) > 0.5) return [bx, s === 1 ? RIVER_BOTTOM + 0.3 : RIVER_TOP - 0.3];
    return [bx, s === 1 ? RIVER_TOP - 0.5 : RIVER_BOTTOM + 0.5];
  }
  return [bx, ts === 1 ? RIVER_BOTTOM + 0.5 : RIVER_TOP - 0.5];
}

function moveToward(e: Entity, tx: number, ty: number, maxStep: number) {
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  const s = Math.min(maxStep, d);
  e.x += (dx / d) * s;
  e.y += (dy / d) * s;
}

function applyDamage(state: GameState, owner: PlayerId, x: number, y: number, target: Entity | null,
  damage: number, splash: number, hitsAir: boolean) {
  if (splash > 0) {
    for (const t of state.entities) {
      if (t.owner === owner || t.hp <= 0 || (t.air && !hitsAir)) continue;
      if (dist(t.x, t.y, x, y) - t.radius <= splash) t.hp -= damage;
    }
    state.events.push({ type: "splash", x, y, radius: splash, owner });
  } else if (target && target.hp > 0) {
    target.hp -= damage;
  }
}

function attack(state: GameState, e: Entity, t: Entity) {
  if (e.range > MELEE_MAX_RANGE) {
    state.projectiles.push({
      id: state.nextId++, owner: e.owner, x: e.x, y: e.y, tx: t.x, ty: t.y, targetId: t.id,
      damage: e.damage, splash: e.splash, speed: PROJECTILE_SPEED, targetsAir: e.targetsAir, src: e.cardId,
    });
  } else {
    applyDamage(state, e.owner, t.x, t.y, t, e.damage, e.splash, e.targetsAir);
  }
}

/** The main tower stays idle until it is damaged or one of its side towers falls. Everything else is always active. */
export function isTowerActive(state: GameState, e: Entity): boolean {
  if (e.cardId !== "tower_main" || e.hp < e.maxHp) return true;
  return state.entities.filter((t) => t.owner === e.owner && t.cardId === "tower_side" && t.hp > 0).length < 2;
}

// ---------- tick ----------

export function step(state: GameState): void {
  if (state.phase === "ended") return;
  state.events = [];
  state.tick++;
  state.time += DT;
  const byId = new Map(state.entities.map((e) => [e.id, e]));

  // mana
  // x2 in the last regulation minute, x3 in overtime so stalemates break open
  const rate = MANA_PER_SEC * (state.phase === "overtime" ? 3 : state.time >= DOUBLE_MANA_AT ? 2 : 1);
  for (const p of state.players) p.mana = Math.min(MANA_MAX, p.mana + rate * DT);

  // entities
  for (const e of state.entities) {
    e.px = e.x;
    e.py = e.y;
    if (e.hp <= 0) continue;
    if (e.deployTimer > 0) { e.deployTimer -= DT; continue; }
    if (e.kind === "building" && e.lifetime > 0) e.hp -= (e.maxHp / e.lifetime) * DT;
    if (!isTowerActive(state, e)) continue;
    if (e.damage <= 0) continue; // passive (e.g. a decoy building): never targets or moves
    e.cooldown = Math.max(0, e.cooldown - DT);

    let target = e.targetId != null ? byId.get(e.targetId) ?? null : null;
    // keep attacking a locked target while it stays in range; otherwise re-evaluate
    if (!target || target.hp <= 0 || edgeDist(e, target) > e.range) target = findTarget(state, e);
    e.targetId = target?.id ?? null;
    if (!target) continue;

    if (edgeDist(e, target) <= e.range) {
      if (e.cooldown <= 0) { attack(state, e, target); e.cooldown = e.hitSpeed; }
    } else if (e.kind === "unit") {
      const [wx, wy] = steer(e, target.x, target.y);
      moveToward(e, wx, wy, e.speed * DT);
    }
  }

  separate(state);

  // projectiles
  state.projectiles = state.projectiles.filter((pr) => {
    const t = byId.get(pr.targetId);
    if (t && t.hp > 0) { pr.tx = t.x; pr.ty = t.y; }
    const d = dist(pr.x, pr.y, pr.tx, pr.ty);
    const s = pr.speed * DT;
    if (d <= s) {
      applyDamage(state, pr.owner, pr.tx, pr.ty, t && t.hp > 0 ? t : null, pr.damage, pr.splash, pr.targetsAir);
      return false;
    }
    pr.x += ((pr.tx - pr.x) / d) * s;
    pr.y += ((pr.ty - pr.y) / d) * s;
    return true;
  });

  // deaths
  const dead = state.entities.filter((e) => e.hp <= 0);
  for (const e of dead) {
    state.events.push({ type: "death", x: e.x, y: e.y, kind: e.kind, owner: e.owner });
    if (e.kind === "tower") {
      const winner = other(e.owner);
      if (e.cardId === "tower_main") {
        state.players[winner].crowns = 3;
        endGame(state, winner);
      } else {
        state.players[winner].crowns++;
        if (state.phase === "overtime") endGame(state, winner); // sudden death
      }
    }
  }
  if (dead.length) state.entities = state.entities.filter((e) => e.hp > 0);

  checkClock(state);
}

/** Push overlapping units apart and keep ground units out of the river and arena bounds. */
function separate(state: GameState) {
  const ents = state.entities;
  for (let i = 0; i < ents.length; i++) {
    const a = ents[i];
    for (let j = i + 1; j < ents.length; j++) {
      const b = ents[j];
      if (a.air !== b.air) continue;
      if (a.kind !== "unit" && b.kind !== "unit") continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const overlap = a.radius + b.radius - d;
      if (overlap <= 0) continue;
      const nx = dx / d, ny = dy / d;
      if (a.kind !== "unit") { b.x += nx * overlap; b.y += ny * overlap; }
      else if (b.kind !== "unit") { a.x -= nx * overlap; a.y -= ny * overlap; }
      else {
        const wa = b.radius / (a.radius + b.radius); // bigger units get pushed less
        a.x -= nx * overlap * wa * 0.5; a.y -= ny * overlap * wa * 0.5;
        b.x += nx * overlap * (1 - wa) * 0.5; b.y += ny * overlap * (1 - wa) * 0.5;
      }
    }
  }
  for (const e of ents) {
    if (e.kind !== "unit") continue;
    e.x = clampX(e.x);
    e.y = Math.min(ARENA_H - 0.3, Math.max(0.3, e.y));
    if (!e.air && riverSide(e.y) === 0 && !onBridge(e.x)) {
      // shoved into water: back to the bank it came from
      e.y = e.py <= (RIVER_TOP + RIVER_BOTTOM) / 2 ? RIVER_TOP : RIVER_BOTTOM;
    }
  }
}

function towerHpRatio(state: GameState, p: PlayerId): number {
  let hp = 0, max = 0;
  for (const e of state.entities) if (e.kind === "tower" && e.owner === p) { hp += Math.max(0, e.hp); max += e.maxHp; }
  // destroyed towers count as max hp lost
  const destroyed = state.players[other(p)].crowns;
  max += destroyed * TOWER_STATS.side.hp;
  return max > 0 ? hp / max : 0;
}

function checkClock(state: GameState) {
  if (state.phase === "ended") return;
  const [a, b] = state.players;
  if (state.phase === "playing" && state.time >= MATCH_TIME) {
    if (a.crowns !== b.crowns) endGame(state, a.crowns > b.crowns ? 0 : 1);
    else state.phase = "overtime";
  } else if (state.phase === "overtime" && state.time >= MATCH_TIME + OVERTIME) {
    const ra = towerHpRatio(state, 0), rb = towerHpRatio(state, 1);
    endGame(state, Math.abs(ra - rb) < 1e-9 ? "draw" : ra > rb ? 0 : 1);
  }
}

function endGame(state: GameState, winner: PlayerId | "draw") {
  if (state.phase === "ended") return;
  state.phase = "ended";
  state.winner = winner;
}

/** End the match with `loser` conceding (surrender or disconnect timeout). */
export function forfeit(state: GameState, loser: PlayerId): void {
  if (state.phase === "ended") return;
  state.events = [];
  endGame(state, other(loser));
}

export function timeLeft(state: GameState): number {
  const inOvertime = state.phase === "overtime" || (state.phase === "ended" && state.time > MATCH_TIME);
  const end = inOvertime ? MATCH_TIME + OVERTIME : MATCH_TIME;
  return Math.max(0, end - state.time);
}
