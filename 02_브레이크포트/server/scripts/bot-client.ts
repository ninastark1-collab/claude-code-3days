/**
 * Headless test opponent: connects to the game server like a real player and plays with the Bot AI.
 *   npx tsx server/scripts/bot-client.ts            -> quick match
 *   npx tsx server/scripts/bot-client.ts ABCDE      -> join a friend room by code
 */
import { Client } from "@colyseus/sdk";
import { Bot, ROOM_NAME, stateFromSnapshot } from "@bf/shared";
import type { GameState, PlayerId, Snapshot } from "@bf/shared";

const url = process.env.SERVER_URL ?? "ws://localhost:2567";
const code = process.argv[2];
const client = new Client(url);
const room = code ? await client.joinById(code.toUpperCase()) : await client.joinOrCreate(ROOM_NAME);
console.log(`[bot] joined room ${room.roomId}`);

let seat: PlayerId = 0;
let bot: Bot | null = null;
let view: GameState | null = null;
let deploys = 0;

room.onMessage("joined", (m: { seat: PlayerId }) => { seat = m.seat; });
room.onMessage("start", (m: { seat: PlayerId }) => {
  seat = m.seat;
  bot = new Bot(seat, "normal");
  console.log(`[bot] match started as P${seat}`);
});
room.onMessage("rejected", (m: { reason: string }) => console.log(`[bot] rejected: ${m.reason}`));
room.onMessage("opponentLeft", () => console.log("[bot] opponent left"));
room.onMessage("snap", (s: Snapshot) => {
  view = stateFromSnapshot(view, s, seat);
  if (s.phase === "ended") {
    console.log(`[bot] match ended. winner=${s.winner} crowns ${s.me.crowns}:${s.oppCrowns}, deploys=${deploys}`);
    room.leave(true).then(() => process.exit(0));
    return;
  }
  const a = bot?.think(view);
  if (a) { room.send("deploy", a); deploys++; }
  if (s.tick % 200 === 0) console.log(`[bot] t=${s.time.toFixed(0)}s mana=${s.me.mana.toFixed(1)} ents=${s.ents.length} crowns ${s.me.crowns}:${s.oppCrowns}`);
});
room.onLeave((c) => { console.log(`[bot] left (${c})`); process.exit(0); });
