import { describe, expect, it } from "vitest";
import { Bot, createGame, deploy, step, MATCH_TIME, OVERTIME, TICK_RATE } from "../src";
import { nextRandom } from "../src/rng";

/** Seeded random source so the test is reproducible (bots are random by design). */
function seeded(seed: number) {
  let st = seed;
  return () => { const [v, n] = nextRandom(st); st = n; return v; };
}

describe("bot", () => {
  it("bot vs bot is not fully passive (towers fall in a fair share of matches)", () => {
    let decisive = 0;
    const N = 20;
    const results: string[] = [];
    for (let k = 0; k < N; k++) {
      const s = createGame(100 + k);
      const bots = [new Bot(0, "normal", seeded(7 + k)), new Bot(1, "normal", seeded(1000 + k))];
      for (let i = 0; i < (MATCH_TIME + OVERTIME + 1) * TICK_RATE && s.phase !== "ended"; i++) {
        for (const b of bots) { const a = b.think(s); if (a) deploy(s, b.player, a.handIndex, a.x, a.y); }
        step(s);
      }
      results.push(`${s.players[0].crowns}:${s.players[1].crowns} @${s.time.toFixed(0)}s`);
      if (s.players[0].crowns + s.players[1].crowns > 0) decisive++;
    }
    expect(decisive).toBeGreaterThanOrEqual(3);
  }, 60_000); // 20 full simulated matches
});
