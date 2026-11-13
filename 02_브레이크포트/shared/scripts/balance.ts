/**
 * Card duel matrix: each unit/building card vs each other, no towers, mirrored placement.
 * Prints who wins and the winner's remaining HP share, plus a mana-efficiency score per card.
 *   npx tsx shared/scripts/balance.ts
 */
import { CARDS, createGame, deploy, step, getCard, TICK_RATE } from "../src";
import type { GameState, PlayerId } from "../src";

const fighters = CARDS.filter((c) => c.type !== "spell").map((c) => c.id);

function duel(a: string, b: string): { winner: PlayerId | null; left: number; time: number } {
  const s: GameState = createGame(1);
  s.entities = []; // no towers
  for (const [p, id] of [[0, a], [1, b]] as const) {
    s.players[p].hand[0] = id;
    s.players[p].mana = 10;
  }
  // same lane as a bridge, within sight of each other
  deploy(s, 0, 0, 3.5, 18.5);
  deploy(s, 1, 0, 3.5, 13.5);
  for (let i = 0; i < 40 * TICK_RATE; i++) {
    step(s);
    const alive = [0, 1].map((p) => s.entities.filter((e) => e.owner === p));
    if (!alive[0].length || !alive[1].length) {
      const w: PlayerId = alive[0].length ? 0 : 1;
      const left = alive[w].reduce((t, e) => t + e.hp, 0) / alive[w].reduce((t, e) => t + e.maxHp, 0);
      return { winner: w, left, time: s.time };
    }
  }
  return { winner: null, left: 0, time: 40 };
}

const score: Record<string, number> = {};
const fair: Record<string, number> = {};
// a matchup where one side can't hit the other at all (ground-only vs air, giant vs units) is a hard counter by design
const immune = (x: string, y: string) => (getCard(y).air && !getCard(x).targetsAir) || !!getCard(x).buildingsOnly;
console.log("A vs B  -> result (winner hp left)");
for (const a of fighters) {
  score[a] = 0;
  fair[a] = 0;
  const row: string[] = [];
  for (const b of fighters) {
    if (a === b) { row.push("   -   "); continue; }
    const r = duel(a, b);
    // value traded: + if A wins, scaled by leftover; normalise by mana spent
    const v = r.winner === 0 ? r.left : r.winner === 1 ? -duel(b, a).left * 0 - r.left : 0;
    // beating a pricier card is worth more; losing to a pricier card costs less
    const ca = getCard(a).cost, cb = getCard(b).cost;
    const pts = r.winner === 0 ? (1 + r.left) * (cb / ca) : r.winner === 1 ? -(1 + r.left) * (ca / cb) : 0;
    score[a] += pts;
    if (!immune(a, b) && !immune(b, a)) fair[a] += pts;
    void v;
    row.push(`${r.winner === 0 ? "W" : r.winner === 1 ? "L" : "D"}${(r.left * 100).toFixed(0).padStart(3)}%`.padEnd(7));
  }
  console.log(`${a.padEnd(12)} ${row.join(" ")}`);
}
console.log("\ncolumns:", fighters.join(", "));
console.log("\nmana-weighted duel score (higher = stronger for its cost):");
for (const [id, v] of Object.entries(score).sort((x, y) => y[1] - x[1])) console.log(`  ${id.padEnd(12)} ${v.toFixed(2)}  (cost ${getCard(id).cost})   fair (no hard counters): ${fair[id].toFixed(2)}`);

// ---- offence: one card alone vs an undefended enemy side tower ----
console.log("\nlone card vs enemy side tower (main tower idle): tower damage per mana, survival time");
for (const c of CARDS) {
  const s: GameState = createGame(1);
  s.players[0].hand[0] = c.id;
  s.players[0].mana = 10;
  const tower = s.entities.find((e) => e.owner === 1 && e.lane === 0)!;
  const x = c.type === "spell" ? tower.x : 3.5;
  const y = c.type === "spell" ? tower.y : c.type === "building" ? 17.5 : 18;
  deploy(s, 0, 0, x, y);
  let t = 0;
  for (let i = 0; i < 60 * TICK_RATE; i++) {
    step(s);
    t = s.time;
    if (!s.entities.some((e) => e.owner === 0 && e.kind !== "tower")) break;
  }
  const dmg = tower.maxHp - Math.max(0, tower.hp);
  console.log(`  ${c.id.padEnd(12)} dmg ${String(Math.round(dmg)).padStart(5)}  per mana ${String(Math.round(dmg / c.cost)).padStart(4)}  alive ${t.toFixed(1)}s`);
}
