export type PlayerId = 0 | 1;
export type CardType = "unit" | "spell" | "building";

export interface CardDef {
  id: string;
  name: string;
  short: string;
  cost: number;
  type: CardType;
  count?: number;
  hp?: number;
  damage: number;
  hitSpeed?: number;
  range?: number;
  speed?: number;
  radius?: number;
  air?: boolean;
  targetsAir?: boolean;
  buildingsOnly?: boolean;
  splash?: number;
  lifetime?: number;
  spellRadius?: number;
  towerDamagePct?: number;
  desc?: string;
  rarity?: "c" | "r" | "e" | "l";
}

export type EntityKind = "unit" | "building" | "tower";

export interface Entity {
  id: number;
  owner: PlayerId;
  kind: EntityKind;
  cardId: string; // "tower_main" / "tower_side" for towers
  lane: 0 | 1 | -1; // side towers: 0 = left, 1 = right
  x: number;
  y: number;
  px: number; // position on previous tick (for render interpolation)
  py: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  range: number;
  damage: number;
  hitSpeed: number;
  cooldown: number;
  air: boolean;
  targetsAir: boolean;
  buildingsOnly: boolean;
  splash: number;
  lifetime: number; // buildings only, 0 = permanent
  deployTimer: number;
  targetId: number | null;
}

export interface Projectile {
  id: number;
  owner: PlayerId;
  x: number;
  y: number;
  tx: number;
  ty: number;
  targetId: number;
  damage: number;
  splash: number;
  speed: number;
  targetsAir: boolean;
  src: string; // cardId of the shooter (for the projectile sprite)
}

export type GameEvent =
  | { type: "spell"; x: number; y: number; radius: number; owner: PlayerId }
  | { type: "splash"; x: number; y: number; radius: number; owner: PlayerId }
  | { type: "death"; x: number; y: number; kind: EntityKind; owner: PlayerId }
  | { type: "deploy"; x: number; y: number; cardId: string; owner: PlayerId };

export interface PlayerState {
  mana: number;
  hand: string[]; // always 4
  next: string;
  queue: string[]; // remaining cycle, next is queue[0]
  crowns: number; // enemy towers destroyed
}

export type Phase = "playing" | "overtime" | "ended";

export interface GameState {
  tick: number;
  time: number; // elapsed seconds
  phase: Phase;
  winner: PlayerId | "draw" | null;
  entities: Entity[];
  projectiles: Projectile[];
  players: [PlayerState, PlayerState];
  events: GameEvent[];
  nextId: number;
  rng: number;
}

export type DeployResult = { ok: true } | { ok: false; reason: string };
