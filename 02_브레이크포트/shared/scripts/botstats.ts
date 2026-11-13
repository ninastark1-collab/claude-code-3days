import { Bot, DEFAULT_DECK, createGame, deploy, randomDeck, step, MATCH_TIME, OVERTIME, TICK_RATE } from "../src";
const N = Number(process.argv[2] ?? 30);
for (const mode of ["default", "random"] as const) {
  let decisive = 0, time = 0;
  for (let k = 0; k < N; k++) {
    const decks: [string[], string[]] = mode === "default" ? [DEFAULT_DECK, DEFAULT_DECK] : [randomDeck(), randomDeck()];
    const s = createGame(1000 + k, decks);
    const bots = [new Bot(0), new Bot(1)];
    for (let i = 0; i < (MATCH_TIME + OVERTIME + 1) * TICK_RATE && s.phase !== "ended"; i++) {
      for (const b of bots) { const a = b.think(s); if (a) deploy(s, b.player, a.handIndex, a.x, a.y); }
      step(s);
    }
    if (s.players[0].crowns + s.players[1].crowns > 0) decisive++;
    time += s.time;
  }
  console.log(`${mode} decks: towers fell in ${decisive}/${N} (${Math.round((decisive / N) * 100)}%), avg length ${(time / N).toFixed(0)}s`);
}
