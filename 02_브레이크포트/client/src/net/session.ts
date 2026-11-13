import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAME } from "@bf/shared";
import type { DeployMessage, PlayerId, Snapshot } from "@bf/shared";
import { getProfile } from "../profile";

/**
 * Battle server address:
 *  - VITE_SERVER_URL at build time (the Android app is built with the public server address)
 *  - Vite dev/preview (ports 5173/4173): the separate dev server on :2567 of the same host
 *  - otherwise the page is served by the game server itself: same origin
 */
const WS = location.protocol === "https:" ? "wss" : "ws";
const SERVER_URL: string = import.meta.env.VITE_SERVER_URL
  || (["5173", "4173"].includes(location.port) ? `${WS}://${location.hostname}:2567` : `${WS}://${location.host}`);
const RESUME_KEY = "bf_resume_token";

let client: Client | null = null;
const getClient = () => (client ??= new Client(SERVER_URL));

export type JoinMode = "quick" | "create" | "join";
export type EndReason = "surrender" | "timeout" | "left";

function storeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(RESUME_KEY, token);
    else sessionStorage.removeItem(RESUME_KEY);
  } catch { /* storage unavailable: page reload just won't resume */ }
}

/** Token of a match this tab was in (survives a page reload), if any. */
export function pendingResumeToken(): string | null {
  try { return sessionStorage.getItem(RESUME_KEY); } catch { return null; }
}
export const clearResumeToken = () => storeToken(null);

/**
 * Wraps a Colyseus room. Handlers are registered immediately on join so no message is lost
 * while scenes switch; snapshots are queued for the battle scene to play back.
 * Short connection drops are retried automatically by the SDK (`reconnecting` while that happens).
 */
export class OnlineSession {
  seat: PlayerId | null = null;
  roomId: string;
  isPrivate = false;
  started = false;
  vsAI = false;
  closed = false;
  reconnecting = false;
  endReason: { reason: EndReason; loser: PlayerId } | null = null;
  snaps: Snapshot[] = [];
  onStart: (() => void) | null = null;
  onRejected: ((reason: string) => void) | null = null;
  onClosed: (() => void) | null = null;

  private constructor(private room: Room) {
    this.roomId = room.roomId;
    room.reconnection.minUptime = 1000; // default 5s would skip drops during the countdown
    room.onMessage("joined", (m: { seat: PlayerId; roomId: string; private: boolean }) => {
      this.seat = m.seat;
      this.roomId = m.roomId;
      this.isPrivate = m.private;
    });
    room.onMessage("start", (m: { seat: PlayerId; resumed?: boolean; vsAI?: boolean }) => {
      this.seat = m.seat;
      this.vsAI = !!m.vsAI;
      storeToken(this.room.reconnectionToken);
      if (m.resumed) this.snaps.length = 0; // stale backlog from before the drop
      const first = !this.started;
      this.started = true;
      if (first) this.onStart?.();
    });
    room.onMessage("snap", (s: Snapshot) => {
      this.snaps.push(s);
      if (s.phase === "ended") storeToken(null);
    });
    room.onMessage("rejected", (m: { reason: string }) => this.onRejected?.(m.reason));
    room.onMessage("ended", (m: { reason: EndReason; loser: PlayerId }) => { this.endReason = m; });
    room.onDrop(() => { this.reconnecting = true; });
    room.onReconnect(() => { this.reconnecting = false; });
    room.onLeave(() => {
      this.closed = true;
      this.reconnecting = false;
      this.onClosed?.();
    });
  }

  static async connect(mode: JoinMode, code?: string): Promise<OnlineSession> {
    const c = getClient();
    const deck = getProfile().deck; // the server validates it and falls back to the default deck
    const room =
      mode === "quick" ? await c.joinOrCreate(ROOM_NAME, { deck })
      : mode === "create" ? await c.create(ROOM_NAME, { private: true, deck })
      : await c.joinById(code!.trim().toUpperCase(), { deck });
    return new OnlineSession(room);
  }

  /** Rejoin a match after a page reload. */
  static async resume(token: string): Promise<OnlineSession> {
    try {
      return new OnlineSession(await getClient().reconnect(token));
    } catch (e) {
      storeToken(null);
      throw e;
    }
  }

  deploy(msg: DeployMessage) {
    if (!this.closed) this.room.send("deploy", msg);
  }

  surrender() {
    if (!this.closed) this.room.send("surrender");
  }

  leave() {
    storeToken(null);
    if (this.closed) return;
    this.closed = true;
    this.onClosed = null;
    this.room.leave(true).catch(() => {});
  }
}
