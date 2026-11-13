import { describe, expect, it } from "vitest";
import { createGame, step, makeSnapshot, stateFromSnapshot, parseDeploy, inDeployZone } from "../src";

describe("network protocol", () => {
  it("snapshot hides the opponent's hand and mana", () => {
    const s = createGame(5);
    const snap = makeSnapshot(s, 1);
    expect(snap.me.hand).toEqual(s.players[1].hand);
    expect(JSON.stringify(snap)).not.toContain(`"queue"`);
    const view = stateFromSnapshot(null, snap, 1);
    expect(view.players[1].hand).toEqual(s.players[1].hand);
    expect(view.players[0].hand).toEqual([]);
    expect(view.entities).toHaveLength(6);
  });

  it("rebuilt state keeps previous positions for interpolation and deploy zones", () => {
    const s = createGame(5);
    const v1 = stateFromSnapshot(null, makeSnapshot(s, 0), 0);
    step(s);
    const v2 = stateFromSnapshot(v1, makeSnapshot(s, 0), 0);
    expect(v2.entities[0].px).toBe(v1.entities[0].x);
    expect(inDeployZone(v2, 0, 9, 22)).toBe(true);
    expect(inDeployZone(v2, 0, 9, 12)).toBe(false);
  });

  it("rejects malformed deploy messages", () => {
    expect(parseDeploy({ handIndex: 1, x: 3, y: 20 })).toEqual({ handIndex: 1, x: 3, y: 20 });
    expect(parseDeploy({ handIndex: 4, x: 3, y: 20 })).toBeNull();
    expect(parseDeploy({ handIndex: 1.5, x: 3, y: 20 })).toBeNull();
    expect(parseDeploy({ handIndex: 0, x: "3", y: 20 })).toBeNull();
    expect(parseDeploy({ handIndex: 0, x: NaN, y: 20 })).toBeNull();
    expect(parseDeploy(null)).toBeNull();
  });
});

describe("match flow", async () => {
  const { forfeit } = await import("../src");
  it("forfeit ends the match for the other player and is idempotent", () => {
    const s = createGame(2);
    forfeit(s, 0);
    expect(s.phase).toBe("ended");
    expect(s.winner).toBe(1);
    forfeit(s, 1);
    expect(s.winner).toBe(1);
  });

  it("snapshot carries countdown and opponent grace", () => {
    const s = createGame(2);
    const snap = makeSnapshot(s, 0, { countdown: 2.345, oppGrace: 12.2 });
    expect(snap.countdown).toBe(2.35);
    expect(snap.oppGrace).toBe(13);
    expect(makeSnapshot(s, 0).oppGrace).toBeNull();
  });
});
