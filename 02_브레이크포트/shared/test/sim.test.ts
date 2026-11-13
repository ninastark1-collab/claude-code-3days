import { describe, expect, it } from "vitest";
import { createGame, step, deploy, canDeploy, getCard, MANA_MAX, TICK_RATE, MATCH_TIME, OVERTIME, Bot } from "../src";
import type { GameState, PlayerId } from "../src";

const run = (s: GameState, seconds: number) => { for (let i = 0; i < seconds * TICK_RATE; i++) step(s); };
const towers = (s: GameState, p: PlayerId) => s.entities.filter((e) => e.kind === "tower" && e.owner === p);

describe("simulation", () => {
  it("creates 3 towers per player and 4-card hands", () => {
    const s = createGame(42);
    expect(towers(s, 0)).toHaveLength(3);
    expect(towers(s, 1)).toHaveLength(3);
    expect(s.players[0].hand).toHaveLength(4);
    expect(s.players[0].queue).toHaveLength(3);
  });

  it("regenerates mana up to the cap", () => {
    const s = createGame(1);
    s.players[0].mana = 0;
    run(s, 2.8);
    expect(s.players[0].mana).toBeCloseTo(1, 1);
    run(s, 60);
    expect(s.players[0].mana).toBe(MANA_MAX);
  });

  it("rejects deploys on the enemy half or without mana", () => {
    const s = createGame(1);
    const i = s.players[0].hand.findIndex((id) => getCard(id).type !== "spell");
    expect(canDeploy(s, 0, i, 9, 8).ok).toBe(false); // enemy half
    expect(canDeploy(s, 0, i, 9, 22).ok).toBe(true);
    expect(canDeploy(s, 1, s.players[1].hand.findIndex((id) => getCard(id).type !== "spell"), 9, 8).ok).toBe(true);
    s.players[0].mana = 0;
    expect(canDeploy(s, 0, i, 9, 22).ok).toBe(false);
  });

  it("cycles the played card to the back of the deck", () => {
    const s = createGame(3);
    s.players[0].mana = 10;
    const played = s.players[0].hand[0];
    const next = s.players[0].next;
    const isSpell = getCard(played).type === "spell";
    expect(deploy(s, 0, 0, 9, isSpell ? 5 : 22).ok).toBe(true);
    expect(s.players[0].hand[0]).toBe(next);
    expect(s.players[0].queue.at(-1)).toBe(played);
  });

  it("an undefended giant crosses the bridge and damages a tower", () => {
    const s = createGame(7);
    s.players[0].hand[0] = "shieldGiant";
    s.players[0].mana = 10;
    expect(deploy(s, 0, 0, 3.5, 20).ok).toBe(true);
    run(s, 25);
    const leftTower = towers(s, 1).find((t) => t.lane === 0);
    expect(!leftTower || leftTower.hp < leftTower.maxHp).toBe(true);
    // ground units never stand in the river off-bridge
    for (const e of s.entities) if (e.kind === "unit") expect(e.y < 15 || e.y > 17 || Math.abs(e.x - 3.5) <= 1 || Math.abs(e.x - 14.5) <= 1).toBe(true);
  });

  it("destroying the main tower ends the game", () => {
    const s = createGame(1);
    const main = towers(s, 1).find((t) => t.cardId === "tower_main")!;
    main.hp = 0;
    step(s);
    expect(s.phase).toBe("ended");
    expect(s.winner).toBe(0);
    expect(s.players[0].crowns).toBe(3);
  });

  it("goes to overtime on a tie and ends after it", () => {
    const s = createGame(1);
    run(s, MATCH_TIME + 0.1);
    expect(s.phase).toBe("overtime");
    run(s, OVERTIME);
    expect(s.phase).toBe("ended");
    expect(s.winner).toBe("draw");
  });

  it("bot vs bot plays a full match without errors", () => {
    const s = createGame(99);
    const bots = [new Bot(0), new Bot(1)];
    for (let i = 0; i < (MATCH_TIME + OVERTIME + 1) * TICK_RATE && s.phase !== "ended"; i++) {
      for (const b of bots) { const a = b.think(s); if (a) deploy(s, b.player, a.handIndex, a.x, a.y); }
      step(s);
    }
    expect(s.phase).toBe("ended");
  });
});

describe("main tower activation", async () => {
  const { isTowerActive } = await import("../src");
  it("main tower idles until damaged or a side tower falls", () => {
    const s = createGame(1);
    const main = towers(s, 1).find((t) => t.cardId === "tower_main")!;
    expect(isTowerActive(s, main)).toBe(false);
    main.hp -= 1;
    expect(isTowerActive(s, main)).toBe(true);
    const s2 = createGame(1);
    const main2 = towers(s2, 1).find((t) => t.cardId === "tower_main")!;
    towers(s2, 1).find((t) => t.lane === 0)!.hp = 0;
    step(s2);
    expect(isTowerActive(s2, main2)).toBe(true);
  });
});

describe("timeLeft", async () => {
  const { timeLeft, forfeit } = await import("../src");
  it("does not jump to overtime when a match ends early", () => {
    const s = createGame(1);
    run(s, 10);
    forfeit(s, 0);
    expect(timeLeft(s)).toBeCloseTo(170, 0);
  });
});
