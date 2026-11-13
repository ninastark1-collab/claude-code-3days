import { describe, expect, it } from "vitest";
import { Bot, CARDS, DEFAULT_DECK, createGame, deploy, getCard, isValidDeck, randomDeck, step, TICK_RATE } from "../src";

describe("decks", () => {
  it("validates decks: 8 distinct existing cards", () => {
    expect(isValidDeck(DEFAULT_DECK)).toBe(true);
    expect(isValidDeck(DEFAULT_DECK.slice(0, 7))).toBe(false);
    expect(isValidDeck([...DEFAULT_DECK.slice(0, 7), DEFAULT_DECK[0]])).toBe(false); // duplicate
    expect(isValidDeck([...DEFAULT_DECK.slice(0, 7), "nope"])).toBe(false);
    expect(isValidDeck("spearman")).toBe(false);
    expect(isValidDeck(null)).toBe(false);
  });

  it("every card has a description and the default deck is valid", () => {
    for (const c of CARDS) expect(c.desc, c.id).toBeTruthy();
    expect(CARDS.length).toBeGreaterThan(8);
  });

  it("random AI decks are valid and always include an anti-air option", () => {
    for (let i = 0; i < 50; i++) {
      const d = randomDeck();
      expect(isValidDeck(d)).toBe(true);
      expect(d.some((id) => getCard(id).targetsAir)).toBe(true);
    }
  });

  it("each player draws only from their own deck", () => {
    const d0 = DEFAULT_DECK;
    const d1 = CARDS.map((c) => c.id).filter((id) => !d0.includes(id)).concat(d0).slice(0, 8);
    const s = createGame(3, [d0, d1]);
    for (const id of [...s.players[0].hand, s.players[0].next, ...s.players[0].queue]) expect(d0).toContain(id);
    for (const id of [...s.players[1].hand, s.players[1].next, ...s.players[1].queue]) expect(d1).toContain(id);
  });
});

describe("bot difficulty", () => {
  const deploysIn = (difficulty: "easy" | "normal" | "hard", seconds: number) => {
    const s = createGame(11);
    const bot = new Bot(1, difficulty);
    let n = 0;
    for (let i = 0; i < seconds * TICK_RATE; i++) {
      s.players[1].mana = 10; // unlimited mana: measures decision rate only
      const a = bot.think(s);
      if (a && deploy(s, 1, a.handIndex, a.x, a.y).ok) n++;
      step(s);
    }
    return n;
  };
  it("harder bots act more often", () => {
    const easy = deploysIn("easy", 30), hard = deploysIn("hard", 30);
    expect(hard).toBeGreaterThan(easy);
  });
});
