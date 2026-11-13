import { Room, type Client } from "@colyseus/core";
import { AI_FALLBACK_SEC, Bot, DEFAULT_DECK, randomDeck, TICK_RATE, createGame, deploy, forfeit, isValidDeck, makeSnapshot, parseDeploy, step } from "@bf/shared";
import type { GameState, PlayerId } from "@bf/shared";

const TICK_MS = 1000 / TICK_RATE;
const COUNTDOWN_SEC = 3;
const RECONNECT_SEC = 30;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

interface CreateOptions { private?: boolean }
interface JoinOptions { deck?: unknown }


/**
 * Authoritative 1v1 battle: the server owns the simulation, clients only send deploy intents.
 * Quick match rooms are public (joinOrCreate fills them); friend rooms are private with a short code as roomId.
 * Flow: 2 players join -> 3s countdown -> match -> result. A dropped player has 30s to reconnect, else forfeits.
 */
export class BattleRoom extends Room {
  maxClients = 2;
  maxMessagesPerSecond = 20; // a human taps a few times per second at most
  private game: GameState | null = null;
  private seats = new Map<string, PlayerId>();
  private isPrivate = false;
  private countdown = 0;
  /** seat -> time (ms) when that player's reconnect window closes */
  private dropDeadline = new Map<PlayerId, number>();
  private decks: [string[], string[]] = [DEFAULT_DECK, DEFAULT_DECK];
  private bot: Bot | null = null;
  private aiTimer: { clear(): void } | null = null;

  onCreate(options: CreateOptions = {}) {
    if (options.private) {
      this.isPrivate = true;
      this.roomId = makeCode();
      this.setPrivate(true);
    }

    this.onMessage("deploy", (client, raw) => {
      const seat = this.seats.get(client.sessionId);
      const msg = parseDeploy(raw);
      if (!this.game || seat === undefined || !msg) return;
      if (this.countdown > 0) { client.send("rejected", { reason: "아직 시작 전" }); return; }
      const res = deploy(this.game, seat, msg.handIndex, msg.x, msg.y);
      if (!res.ok) client.send("rejected", { reason: res.reason });
    });

    this.onMessage("surrender", (client) => {
      const seat = this.seats.get(client.sessionId);
      if (seat !== undefined) this.endBy(seat, "surrender");
    });
  }

  onJoin(client: Client, options: JoinOptions = {}) {
    const seat: PlayerId = [...this.seats.values()].includes(0) ? 1 : 0;
    this.seats.set(client.sessionId, seat);
    this.decks[seat] = isValidDeck(options.deck) ? [...options.deck] : DEFAULT_DECK;
    // quick match with nobody else around: hand the player an AI opponent instead of an endless wait
    if (!this.isPrivate && this.seats.size === 1) {
      this.aiTimer?.clear();
      this.aiTimer = this.clock.setTimeout(() => {
        if (!this.game && this.seats.size === 1) this.startMatch(true);
      }, AI_FALLBACK_SEC * 1000);
    }
    client.send("joined", { seat, roomId: this.roomId, private: this.isPrivate });
    console.log(`[${this.roomId}] ${client.sessionId} joined as P${seat}`);
    if (this.seats.size === 2) this.startMatch();
  }

  private startMatch(vsAI = false) {
    this.lock();
    if (vsAI) {
      const botSeat: PlayerId = [...this.seats.values()][0] === 0 ? 1 : 0;
      this.decks[botSeat] = randomDeck();
      this.bot = new Bot(botSeat, "normal");
    }
    this.game = createGame((Math.random() * 2 ** 31) | 0, this.decks);
    this.countdown = COUNTDOWN_SEC;
    for (const c of this.clients) c.send("start", { seat: this.seats.get(c.sessionId), vsAI });

    // fixed timestep driven by real elapsed time (OS timers fire late, especially on Windows)
    let acc = 0;
    this.setSimulationInterval((deltaMs) => {
      acc += Math.min(deltaMs, 250);
      while (acc >= TICK_MS && this.game && this.game.phase !== "ended") {
        acc -= TICK_MS;
        this.tick();
      }
    }, TICK_MS / 2);
    console.log(`[${this.roomId}] match starting`);
  }

  private tick() {
    const g = this.game!;
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - TICK_MS / 1000);
      g.events = [];
    } else {
      if (this.bot) {
        const a = this.bot.think(g);
        if (a) deploy(g, this.bot.player, a.handIndex, a.x, a.y);
      }
      step(g);
    }
    // reconnect windows
    const now = Date.now();
    for (const [seat, deadline] of this.dropDeadline) {
      if (now >= deadline) { this.endBy(seat, "timeout"); return; }
    }
    this.sendSnapshots();
    if (g.phase === "ended") this.finish();
  }

  private sendSnapshots() {
    const g = this.game;
    if (!g) return;
    const now = Date.now();
    for (const c of this.clients) {
      const seat = this.seats.get(c.sessionId);
      if (seat === undefined) continue;
      const oppDeadline = this.dropDeadline.get(seat === 0 ? 1 : 0);
      c.send("snap", makeSnapshot(g, seat, {
        countdown: this.countdown,
        oppGrace: oppDeadline === undefined ? null : Math.max(0, (oppDeadline - now) / 1000),
      }));
    }
  }

  /** End the match with `loser` conceding. */
  private endBy(loser: PlayerId, reason: "surrender" | "timeout" | "left") {
    const g = this.game;
    if (!g || g.phase === "ended") return;
    forfeit(g, loser);
    this.broadcast("ended", { reason, loser });
    this.sendSnapshots();
    this.finish();
  }

  private finish() {
    this.setSimulationInterval(undefined);
    this.dropDeadline.clear();
    console.log(`[${this.roomId}] match ended, winner: P${this.game?.winner}`);
  }

  async onDrop(client: Client) {
    const seat = this.seats.get(client.sessionId);
    if (seat === undefined || !this.game || this.game.phase === "ended") return;
    console.log(`[${this.roomId}] P${seat} dropped, waiting ${RECONNECT_SEC}s`);
    this.dropDeadline.set(seat, Date.now() + RECONNECT_SEC * 1000);
    try {
      await this.allowReconnection(client, RECONNECT_SEC + 1); // the tick loop enforces the exact deadline
    } catch {
      /* window expired: onLeave handles it */
    }
  }

  onReconnect(client: Client) {
    const seat = this.seats.get(client.sessionId);
    if (seat === undefined) return;
    this.dropDeadline.delete(seat);
    client.send("start", { seat, resumed: true, vsAI: !!this.bot });
    console.log(`[${this.roomId}] P${seat} reconnected`);
  }

  onLeave(client: Client) {
    const seat = this.seats.get(client.sessionId);
    console.log(`[${this.roomId}] ${client.sessionId} (P${seat}) left`);
    if (seat === undefined) return;
    if (!this.game) { // left the waiting room: free the seat
      this.seats.delete(client.sessionId);
      this.aiTimer?.clear();
      return;
    }
    this.dropDeadline.delete(seat);
    this.endBy(seat, "left");
  }
}
