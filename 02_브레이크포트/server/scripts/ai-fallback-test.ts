/**
 * Quick match with nobody else waiting -> AI opponent after AI_FALLBACK_SEC; custom decks are honoured.
 *   npx tsx server/scripts/ai-fallback-test.ts      (server must be running)
 */
import { Client } from "@colyseus/sdk";
import { AI_FALLBACK_SEC, ROOM_NAME } from "@bf/shared";
import type { Snapshot } from "@bf/shared";

const url = process.env.SERVER_URL ?? "ws://localhost:2567";
let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const myDeck = ["mushroomTrio", "pumpkinKnight", "candleWatch", "quillRain", "apprenticeCat", "bats", "spearman", "fireball"];
const room = await new Client(url).joinOrCreate(ROOM_NAME, { deck: myDeck });
let start = null as { seat: number; vsAI?: boolean } | null;
let last = null as Snapshot | null;
let startedAt = 0;
const t0 = Date.now();
room.onMessage("joined", () => {});
room.onMessage("start", (m) => { start = m; startedAt = Date.now(); });
room.onMessage("snap", (s: Snapshot) => { last = s; });
room.onMessage("rejected", () => {});

while (!start && Date.now() - t0 < (AI_FALLBACK_SEC + 5) * 1000) await wait(200);
const waited = (startedAt - t0) / 1000;
check(!!start && start.vsAI === true, `AI opponent assigned (vsAI=${start?.vsAI})`);
check(waited >= AI_FALLBACK_SEC - 0.5 && waited <= AI_FALLBACK_SEC + 2, `after ~${AI_FALLBACK_SEC}s (${waited.toFixed(1)}s)`);

await wait(4000); // countdown
const s1 = last as Snapshot | null;
const mine = s1 ? [...s1.me.hand, s1.me.next] : [];
check(mine.length === 5 && mine.every((id) => myDeck.includes(id)), `my hand comes from my custom deck (${mine.join(", ")})`);

// the AI plays cards (kind index 2 = tower; anything else of the AI's is a unit/building it deployed)
let aiActed = false;
for (let i = 0; i < 40 && !aiActed; i++) {
  await wait(500);
  aiActed = !!(last as Snapshot | null)?.ents.some((e) => e[1] !== start!.seat && e[2] !== 2);
}
check(aiActed, "AI deploys units");

// an invalid deck falls back to the default instead of being trusted
const r2 = await new Client(url).create(ROOM_NAME, { private: true, deck: ["bats", "bats", "bats", "bats", "bats", "bats", "bats", "bats"] });
const r3 = await new Client(url).joinById(r2.roomId, {});
let snap2 = null as Snapshot | null;
r2.onMessage("snap", (s: Snapshot) => { snap2 = s; });
for (const m of ["joined", "start", "rejected"]) { r2.onMessage(m, () => {}); r3.onMessage(m, () => {}); }
r3.onMessage("snap", () => {});
await wait(800);
const hand2 = snap2 ? [...(snap2 as Snapshot).me.hand, (snap2 as Snapshot).me.next] : [];
check(new Set(hand2).size === 5, `invalid deck replaced by default deck (${hand2.join(", ")})`);

await room.leave(); await r2.leave(); await r3.leave();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
