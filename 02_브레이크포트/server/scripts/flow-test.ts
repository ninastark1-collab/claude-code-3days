/**
 * End-to-end match-flow check against a running server (npm run start -w server):
 * countdown -> deploy rejected during countdown -> drop -> auto-reconnect -> surrender.
 *   npx tsx server/scripts/flow-test.ts
 */
import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAME } from "@bf/shared";
import type { Snapshot } from "@bf/shared";

const url = process.env.SERVER_URL ?? "ws://localhost:2567";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++; };

function track(room: Room) {
  room.reconnection.minUptime = 1000; // same as the game client (session.ts)
  const t = { last: null as Snapshot | null, rejected: [] as string[], ended: null as any, reconnected: 0 };
  room.onMessage("snap", (s: Snapshot) => { t.last = s; });
  room.onMessage("rejected", (m: { reason: string }) => t.rejected.push(m.reason));
  room.onMessage("ended", (m: unknown) => { t.ended = m; });
  room.onMessage("joined", () => {});
  room.onMessage("start", () => {});
  room.onReconnect(() => { t.reconnected++; });
  return t;
}

const a = await new Client(url).create(ROOM_NAME, { private: true });
const ta = track(a);
const b = await new Client(url).joinById(a.roomId);
const tb = track(b);
check(/^[A-Z2-9]{5}$/.test(a.roomId), `private room code looks right (${a.roomId})`);

await wait(500);
check((ta.last?.countdown ?? 0) > 2, `countdown running (${ta.last?.countdown})`);
a.send("deploy", { handIndex: 0, x: 9, y: 22 });
await wait(300);
check(ta.rejected.includes("아직 시작 전"), "deploy rejected during countdown");

await wait(3000);
check(ta.last?.countdown === 0 && (ta.last?.time ?? 0) > 0, `match running (t=${ta.last?.time})`);

// 1) short network blip on B: the SDK reconnects by itself
// 4010 = MAY_TRY_RECONNECT (a real network loss arrives as 1006, handled the same way)
b.connection.close(4010, "test drop");
for (let i = 0; i < 40 && tb.reconnected === 0; i++) await wait(250);
check(tb.reconnected > 0, "short drop: B reconnected automatically");
await wait(500);
check(ta.last?.oppGrace === null && ta.last?.phase !== "ended", "short drop: match goes on, no grace shown");

// 2) longer outage (e.g. page reload): B is gone for 2s, then rejoins with its token
const token = b.reconnectionToken;
b.reconnection.enabled = false;
b.connection.close(4010, "test outage");
await wait(2000);
const grace = ta.last?.oppGrace;
check(typeof grace === "number" && grace >= 25 && grace <= 29, `outage: A sees opponent grace countdown (${grace}s)`);
check(ta.last?.phase !== "ended", "outage: match continues while B is away");

const b2 = await new Client(url).reconnect(token);
const tb2 = track(b2);
await wait(600);
check(ta.last?.oppGrace === null, "rejoin: A sees opponent back (grace cleared)");
check((tb2.last?.time ?? 0) > 0 && tb2.last?.me.hand.length === 4, "rejoin: B receives its own snapshots again");

b2.send("surrender");
await wait(500);
check(ta.ended?.reason === "surrender", `A told B surrendered (${JSON.stringify(ta.ended)})`);
check(ta.last?.phase === "ended" && ta.last?.winner === 0, `match ended, A (P0) wins (winner=${ta.last?.winner})`);

await a.leave(); await b2.leave().catch(() => {});
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
