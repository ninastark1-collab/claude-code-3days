import * as Phaser from "phaser";
import {
  ARENA_H, ARENA_W, BRIDGES, BRIDGE_HALF, Bot, DEPLOY_EXPANDED_MIN_Y, DEPLOY_MIN_Y, DT, MANA_MAX,
  RIVER_BOTTOM, RIVER_TOP, canDeploy, createGame, deploy, forfeit, getCard, inDeployZone, stateFromSnapshot, step, timeLeft,
  DOUBLE_MANA_AT, isTowerActive, randomDeck,
} from "@bf/shared";
import type { BotDifficulty, Entity, GameEvent, GameState, PlayerId } from "@bf/shared";
import { ARENA_PX_H, COLORS, CSS, FONT, FONT_HAND, FONT_NUM, FONT_TITLE, GAME_H, GAME_W, TILE } from "../layout";
import type { OnlineSession } from "../net/session";
import { TEX_SCALE, towerKey, unitKey, type Team } from "../art";
import { attackAnim, hasAnim, projectileFor, projectileKey, walkAnim } from "../assets";
import { play, unlockAudio, vibrate } from "../audio";
import { getProfile, rankOf, recordResult, saveProfile } from "../profile";
import { cardInfo } from "../ui/cardInfo";
import { CardView, makeButton, makePanel } from "../ui/widgets";

/** Snapshots buffered before playback starts (smooths network jitter). */
const SNAP_BUFFER = 2;
const LOCAL_COUNTDOWN = 3;

type Effect =
  | { kind: "ring"; x: number; y: number; r: number; ttl: number; max: number; color: number }
  | { kind: "frag"; x: number; y: number; vx: number; vy: number; size: number; ttl: number; max: number; color: number };

const CARD_Y = 1362;
const CARD_W = 136;
const CARD_H = 175;
const CARDS_X = 132;
const HIT_FLASH_MS = 90;
const LONG_PRESS_MS = 420;
const MANA_Y = 1300;
const DIFF_NAME: Record<BotDifficulty, string> = { easy: "쉬움", normal: "보통", hard: "어려움" };
/** First practice match: short hints at these match times (seconds). */
const TUTORIAL: [number, string][] = [
  [0.3, "카드를 끌어서 아래쪽 내 진영에 놓아 보세요"],
  [9, "보라색 잉크(마나)는 시간이 지나면 차요\n카드 왼쪽 위 숫자가 필요한 잉크예요"],
  [20, "상대 탑을 부수세요! 가운데 종탑을 부수면 즉시 승리"],
  [32, "날아다니는 적은 포크창 도깨비·새총 쌍둥이·\n견습 마법사 냥냥·주문으로 막아요"],
  [44, "카드를 길게 누르면 능력치를 볼 수 있어요"],
];

export class BattleScene extends Phaser.Scene {
  private state!: GameState;
  private me: PlayerId = 0;
  private bot: Bot | null = null;
  private session: OnlineSession | null = null;
  private playing = false; // online: playback has started
  private acc = 0;

  private dyn!: Phaser.GameObjects.Graphics; // shadows (under sprites)
  private top!: Phaser.GameObjects.Graphics; // hp bars, projectiles, effects (over sprites)
  private overlay!: Phaser.GameObjects.Graphics;
  private sprites = new Map<number, Phaser.GameObjects.Sprite>();
  private deployFx = new Map<number, Phaser.GameObjects.Sprite>();
  private projPool: Phaser.GameObjects.Image[] = [];
  private hpTexts = new Map<number, Phaser.GameObjects.Text>();
  private lastHp = new Map<number, number>();
  private flashUntil = new Map<number, number>();
  private lastProjectiles = 0;
  private effects: Effect[] = [];
  private slots: CardView[] = [];
  private nextSlot!: CardView;
  private myTagText!: Phaser.GameObjects.Text;
  private manaText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private crownText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;

  private selected: number | null = null;
  private dragging = false;
  private ghost: { x: number; y: number } | null = null;
  private resultShown = false;
  private countdown = 0;
  private oppGrace: number | null = null;
  private lastCountdownShown = -1;
  private prevTime = 0;
  private prevPhase = "playing";
  private countdownText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private dialog: Phaser.GameObjects.GameObject[] = [];
  private surrendered = false;
  private difficulty: BotDifficulty = "normal";
  private tutorial = false;
  private tutorialStep = 0;
  private tipText!: Phaser.GameObjects.Text;
  private infoPanel!: Phaser.GameObjects.Container;
  private infoTitle!: Phaser.GameObjects.Text;
  private infoBody!: Phaser.GameObjects.Text;
  private pressTimer: Phaser.Time.TimerEvent | null = null;

  constructor() { super("Battle"); }

  init(data: { mode?: string; session?: OnlineSession; difficulty?: BotDifficulty }) {
    this.session = data.mode === "online" ? data.session ?? null : null;
    this.me = this.session?.seat ?? 0;
    this.difficulty = data.difficulty ?? getProfile().difficulty;
    // practice: my saved deck vs a random AI deck. Online: placeholder board until the first snapshot.
    this.state = createGame((Math.random() * 2 ** 31) | 0, [getProfile().deck, randomDeck()]);
    this.playing = !this.session;
    this.bot = data.mode === "bot" ? new Bot(1, this.difficulty) : null;
    this.tutorial = !!this.bot && !getProfile().tutorialDone;
    this.tutorialStep = 0;
    this.pressTimer = null;
    this.acc = 0;
    this.sprites = new Map();
    this.deployFx = new Map();
    this.projPool = [];
    this.hpTexts = new Map();
    this.lastHp = new Map();
    this.flashUntil = new Map();
    this.lastProjectiles = 0;
    this.effects = [];
    this.slots = [];
    this.selected = null;
    this.dragging = false;
    this.ghost = null;
    this.resultShown = false;
    this.countdown = this.session ? 3 : LOCAL_COUNTDOWN;
    this.oppGrace = null;
    this.lastCountdownShown = -1;
    this.prevTime = 0;
    this.prevPhase = "playing";
    this.dialog = [];
    this.surrendered = false;
  }

  create() {
    this.drawArena();
    this.dyn = this.add.graphics();
    this.top = this.add.graphics().setDepth(3);
    this.overlay = this.add.graphics().setDepth(5);
    this.createUi();
    this.input.on("pointerdown", this.onDown, this);
    this.input.on("pointermove", this.onMove, this);
    this.input.on("pointerup", this.onUp, this);
    for (const e of this.state.entities) this.lastHp.set(e.id, e.hp);

    if (this.session) {
      const s = this.session;
      s.onRejected = (reason) => { this.showToast(reason); play("error"); };
      s.onClosed = () => { if (this.state.phase !== "ended") this.showDisconnected(); };
      if (s.closed) this.showDisconnected();
      this.events.once("shutdown", () => { s.onRejected = null; s.onClosed = null; s.leave(); });
    }
  }

  // ---------- coordinates (player 1 sees the board rotated 180°) ----------

  private toScreen(x: number, y: number): [number, number] {
    return this.me === 0 ? [x * TILE, y * TILE] : [(ARENA_W - x) * TILE, (ARENA_H - y) * TILE];
  }

  private toWorld(sx: number, sy: number): [number, number] {
    let x = sx / TILE, y = sy / TILE;
    if (this.me === 1) { x = ARENA_W - x; y = ARENA_H - y; }
    return [Math.round(x * 2) / 2, Math.round(y * 2) / 2]; // snap to half tiles
  }

  // ---------- static arena (point-symmetric, so it looks the same from both seats) ----------

  private drawArena() {
    if (this.textures.exists("bg_arena")) this.add.image(0, 0, "bg_arena").setOrigin(0, 0).setDisplaySize(GAME_W, ARENA_PX_H);
    else this.drawFallbackArena();
    // HUD panel: night velvet with a gold rule (art book)
    const g = this.add.graphics();
    g.fillGradientStyle(0x2c2656, 0x2c2656, 0x16122f, 0x16122f, 1).fillRect(0, ARENA_PX_H, GAME_W, GAME_H - ARENA_PX_H);
    g.fillStyle(COLORS.gold).fillRect(0, ARENA_PX_H, GAME_W, 6);
  }

  /** Used only if bg/arena.png is missing. */
  private drawFallbackArena() {
    const g = this.add.graphics();
    for (let ty = 0; ty < ARENA_H; ty++) {
      for (let tx = 0; tx < ARENA_W; tx++) g.fillStyle((tx + ty) % 2 ? COLORS.grass : COLORS.grassDark).fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
    g.fillStyle(COLORS.river).fillRect(0, RIVER_TOP * TILE, GAME_W, (RIVER_BOTTOM - RIVER_TOP) * TILE);
    for (const b of BRIDGES) g.fillStyle(COLORS.bridge).fillRect((b - BRIDGE_HALF) * TILE, (RIVER_TOP - 0.3) * TILE, BRIDGE_HALF * 2 * TILE, (RIVER_BOTTOM - RIVER_TOP + 0.6) * TILE);
  }

  // ---------- UI ----------

  /** House tag ("달빛관 · 나" / "노을관 · 상대") from the art book HUD. */
  private tag(x: number, y: number, color: number): Phaser.GameObjects.Text {
    const t = this.add.text(x + 12, y + 6, "", { fontFamily: FONT_NUM, fontSize: "24px", color: CSS.text }).setDepth(11);
    const bg = this.add.rectangle(x, y, 10, 10, COLORS.ui, 0.9).setOrigin(0, 0).setStrokeStyle(3, color).setDepth(10);
    (t as Phaser.GameObjects.Text & { tagBg?: Phaser.GameObjects.Rectangle }).tagBg = bg;
    return t;
  }

  private syncTag(t: Phaser.GameObjects.Text, text: string) {
    if (t.text === text) return;
    t.setText(text);
    const bg = (t as Phaser.GameObjects.Text & { tagBg?: Phaser.GameObjects.Rectangle }).tagBg!;
    bg.setSize(t.width + 24, t.height + 12);
  }

  private createUi() {
    for (let i = 0; i < 4; i++) this.slots.push(new CardView(this, CARDS_X + i * (CARD_W + 10), CARD_Y, CARD_W, 1));
    this.add.text(62, CARD_Y + 6, "다음", { fontFamily: FONT_HAND, fontStyle: "bold", fontSize: "26px", color: CSS.dim }).setOrigin(0.5, 0);
    this.nextSlot = new CardView(this, 14, CARD_Y + 44, 96, 1);

    // ink drop + mana number
    const drop = this.add.graphics().setDepth(1);
    const dx = 46, dy = MANA_Y + 14;
    drop.fillStyle(COLORS.mana).lineStyle(4, COLORS.ink);
    drop.beginPath().moveTo(dx, dy - 34).lineTo(dx - 22, dy - 2).arc(dx, dy + 6, 23, Math.PI * 1.1, Math.PI * 1.9, true).lineTo(dx, dy - 34).closePath().fillPath().strokePath();
    drop.fillStyle(0xffffff, 0.45).fillEllipse(dx - 9, dy + 2, 7, 14);
    this.manaText = this.add.text(dx, dy + 8, "", { fontFamily: FONT_NUM, fontSize: "30px", color: "#ffffff" }).setOrigin(0.5).setStroke(CSS.ink, 5).setDepth(2);

    // parchment timer (top right)
    const timer = this.add.container(GAME_W - 82, 50).setDepth(10).setRotation(0.05);
    timer.add(this.add.rectangle(4, 6, 132, 70, COLORS.ink));
    timer.add(this.add.rectangle(0, 0, 132, 70, COLORS.parchment).setStrokeStyle(3, COLORS.ink));
    timer.add(this.add.text(0, -20, "남은 시간", { fontFamily: FONT_NUM, fontSize: "16px", color: "#7a6040" }).setOrigin(0.5));
    this.timerText = this.add.text(0, 10, "", { fontFamily: FONT_NUM, fontSize: "32px", color: CSS.ribbon }).setOrigin(0.5);
    timer.add(this.timerText);

    // house tags: enemy top-left, me above the hand
    this.crownText = this.tag(14, 14, COLORS.enemy);
    this.myTagText = this.tag(14, ARENA_PX_H - 56, COLORS.me);

    this.countdownText = this.add.text(GAME_W / 2, ARENA_PX_H / 2, "", { fontFamily: FONT_NUM, fontSize: "200px", color: CSS.gold })
      .setOrigin(0.5).setStroke(CSS.ink, 16).setDepth(15);
    this.bannerText = this.add.text(GAME_W / 2, ARENA_PX_H / 2 - 160, "", { fontFamily: FONT_TITLE, fontStyle: "bold", fontSize: "54px", color: CSS.parchment, align: "center" })
      .setOrigin(0.5).setStroke(CSS.ink, 12).setDepth(15).setAlpha(0);
    this.statusText = this.add.text(GAME_W / 2, 140, "", { fontFamily: FONT, fontSize: "26px", color: CSS.text, align: "center", backgroundColor: "#1d1838ee", padding: { x: 16, y: 10 } })
      .setOrigin(0.5, 0).setDepth(15).setVisible(false);

    makeButton(this, 84, 98, "기권", "red", () => this.confirmSurrender(), { width: 140, height: 56, fontSize: 26, depth: 10 });
    this.toast = this.add.text(GAME_W / 2, ARENA_PX_H - 100, "", { fontFamily: FONT_NUM, fontSize: "32px", color: "#ffd9cf" })
      .setOrigin(0.5).setStroke(CSS.ink, 7).setDepth(10).setAlpha(0);

    // opponent label (practice bot / AI fallback)
    const vsLabel = this.bot ? `연습 · 봇 ${DIFF_NAME[this.difficulty]}` : this.session?.vsAI ? "AI 상대" : "";
    if (vsLabel) this.add.text(GAME_W - 16, 100, vsLabel, { fontFamily: FONT_NUM, fontSize: "20px", color: CSS.parchment, backgroundColor: "#1d1838dd", padding: { x: 8, y: 3 } }).setOrigin(1, 0).setDepth(10);

    this.tipText = this.add.text(GAME_W / 2, ARENA_PX_H - 170, "", { fontFamily: FONT_HAND, fontStyle: "bold", fontSize: "32px", color: CSS.ink, align: "center", backgroundColor: "#f4e9d2f2", padding: { x: 20, y: 12 } })
      .setOrigin(0.5).setDepth(14).setAlpha(0);

    // long-press card info (parchment)
    this.infoTitle = this.add.text(-GAME_W / 2 + 44, -88, "", { fontFamily: FONT_TITLE, fontStyle: "bold", fontSize: "28px", color: CSS.ink });
    this.infoBody = this.add.text(-GAME_W / 2 + 44, -44, "", { fontFamily: FONT, fontSize: "23px", color: "#3a2a14", lineSpacing: 8, wordWrap: { width: GAME_W - 88 } });
    this.infoPanel = this.add.container(GAME_W / 2, ARENA_PX_H - 130, [
      this.add.rectangle(0, 0, GAME_W - 30, 220, COLORS.parchment, 0.97).setStrokeStyle(5, COLORS.ink),
      this.infoTitle, this.infoBody,
    ]).setDepth(16).setVisible(false);
  }

  private showCardInfo(slot: number) {
    const id = this.state.players[this.me].hand[slot];
    if (!id) return;
    const info = cardInfo(id);
    this.infoTitle.setText(info.title);
    this.infoBody.setText(info.lines.join("\n"));
    this.infoPanel.setVisible(true);
    vibrate(8);
  }

  private hideCardInfo() {
    this.pressTimer?.remove();
    this.pressTimer = null;
    this.infoPanel.setVisible(false);
  }

  private showTip(msg: string) {
    this.tipText.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.tipText);
    this.tweens.add({ targets: this.tipText, alpha: 0, delay: 5500, duration: 500 });
  }

  private showToast(msg: string) {
    this.toast.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 700, duration: 400 });
  }

  // ---------- input ----------

  private slotAt(x: number, y: number): number | null {
    for (let i = 0; i < this.slots.length; i++) {
      const sx = CARDS_X + i * (CARD_W + 10);
      if (x >= sx && x <= sx + CARD_W && y >= CARD_Y - 20 && y <= CARD_Y + CARD_H) return i;
    }
    return null;
  }

  private onDown(p: Phaser.Input.Pointer) {
    unlockAudio();
    if (this.state.phase === "ended" || !this.playing || this.countdown > 0 || this.dialog.length) return;
    const slot = this.slotAt(p.x, p.y);
    if (slot !== null) {
      if (this.selected !== slot) play("select");
      this.selected = slot;
      this.dragging = true;
      this.ghost = null;
      this.hideCardInfo();
      this.pressTimer = this.time.delayedCall(LONG_PRESS_MS, () => {
        if (this.dragging && this.selected === slot && !this.ghost) this.showCardInfo(slot);
      });
      return;
    }
    if (p.y < ARENA_PX_H && this.selected !== null) this.tryDeploy(p.x, p.y);
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (this.selected === null) return;
    if (p.y < ARENA_PX_H) {
      const [x, y] = this.toWorld(p.x, p.y);
      this.ghost = { x, y };
      if (this.infoPanel.visible || this.pressTimer) this.hideCardInfo(); // dragging onto the field cancels the info
    } else this.ghost = null;
  }

  private onUp(p: Phaser.Input.Pointer) {
    this.hideCardInfo();
    if (!this.dragging) return;
    this.dragging = false;
    if (p.y < ARENA_PX_H && this.selected !== null) this.tryDeploy(p.x, p.y);
    // released over the hand = "tap to select", keep selection for tap-to-place
  }

  private tryDeploy(sx: number, sy: number) {
    const [x, y] = this.toWorld(sx, sy);
    if (this.session) {
      // check locally for instant feedback; the server re-validates
      const check = canDeploy(this.state, this.me, this.selected!, x, y);
      if (!check.ok) { this.showToast(check.reason); play("error"); return; }
      this.session.deploy({ handIndex: this.selected!, x, y });
      this.ring(x, y, 0.8, 0.35, 0xffffff);
    } else {
      const res = deploy(this.state, this.me, this.selected!, x, y);
      if (!res.ok) { this.showToast(res.reason); play("error"); return; }
    }
    play("deploy");
    vibrate(12);
    this.selected = null;
    this.ghost = null;
  }

  // ---------- loop ----------

  update(_t: number, deltaMs: number) {
    if (this.session) { this.updateOnline(deltaMs); return; }
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - deltaMs / 1000);
      this.render(0);
      this.updateNotices();
      return;
    }
    this.acc += Math.min(deltaMs, 250) / 1000;
    while (this.acc >= DT) {
      if (this.bot) {
        const a = this.bot.think(this.state);
        if (a) deploy(this.state, this.bot.player, a.handIndex, a.x, a.y);
      }
      step(this.state);
      this.afterTick();
      this.acc -= DT;
    }
    this.render(this.acc / DT);
    this.updateNotices();
    if (this.state.phase === "ended" && !this.resultShown) this.showResult();
  }

  /** Play back server snapshots one per tick, slightly behind real time, catching up if the buffer grows. */
  private updateOnline(deltaMs: number) {
    const q = this.session!.snaps;
    if (!this.playing) {
      if (q.length < SNAP_BUFFER) return;
      this.playing = true;
      this.acc = 0;
    }
    this.acc += Math.min(deltaMs, 250) / 1000;
    while (this.acc >= DT && q.length) {
      if (q.length > SNAP_BUFFER + 3) q.splice(0, q.length - SNAP_BUFFER - 1).forEach((s) => s.events.forEach((e) => this.onEvent(e)));
      const snap = q.shift()!;
      this.state = stateFromSnapshot(this.state, snap, this.me);
      this.countdown = snap.countdown;
      this.oppGrace = snap.oppGrace;
      this.afterTick();
      this.acc -= DT;
    }
    if (!q.length) this.acc = Math.min(this.acc, DT); // starved: hold at the latest snapshot
    this.render(Math.min(1, this.acc / DT));
    this.updateNotices();
    if (this.state.phase === "ended" && !this.resultShown) this.showResult();
  }

  /** Per-tick feedback: events, hit flashes and attack sounds (works the same offline and online). */
  private afterTick() {
    for (const ev of this.state.events) this.onEvent(ev);
    const now = this.time.now;
    let hits = 0;
    for (const e of this.state.entities) {
      const prev = this.lastHp.get(e.id);
      if (prev !== undefined && e.hp < prev - 0.5 && !(e.kind === "building" && prev - e.hp < 5)) {
        this.flashUntil.set(e.id, now + HIT_FLASH_MS);
        hits++;
      }
      this.lastHp.set(e.id, e.hp);
    }
    if (hits) play("hit");
    if (this.state.projectiles.length > this.lastProjectiles) play("shoot");
    this.lastProjectiles = this.state.projectiles.length;
  }

  /** Countdown numbers, phase banners (double mana / overtime) and connection status. */
  private updateNotices() {
    const n = Math.ceil(this.countdown);
    if (n !== this.lastCountdownShown) {
      this.lastCountdownShown = n;
      if (n > 0) {
        this.countdownText.setText(String(n)).setAlpha(1).setScale(1.4);
        this.tweens.add({ targets: this.countdownText, scale: 1, duration: 300, ease: "Back.Out" });
        play("tick");
      } else if (this.playing) {
        this.countdownText.setText("시작!").setAlpha(1).setScale(1);
        this.tweens.add({ targets: this.countdownText, alpha: 0, delay: 500, duration: 400 });
        play("go");
      }
    }

    const t = this.state.time;
    if (this.tutorial && this.countdown <= 0 && this.tutorialStep < TUTORIAL.length && t >= TUTORIAL[this.tutorialStep][0]) {
      this.showTip(TUTORIAL[this.tutorialStep][1]);
      this.tutorialStep++;
    }
    if (this.prevTime < DOUBLE_MANA_AT && t >= DOUBLE_MANA_AT && this.state.phase === "playing") { this.showBanner("마나 2배!\n남은 시간 1분"); play("go"); }
    if (this.prevPhase === "playing" && this.state.phase === "overtime") { this.showBanner("연장전!\n먼저 타워를 부수면 승리"); play("go"); }
    this.prevTime = t;
    this.prevPhase = this.state.phase;

    let status = "";
    if (this.session?.reconnecting) status = "연결이 불안정합니다 · 재연결 중…";
    else if (this.oppGrace !== null && this.state.phase !== "ended") status = `상대 연결 끊김 · ${this.oppGrace}초 안에 돌아오지 않으면 승리`;
    this.statusText.setVisible(!!status);
    if (status && this.statusText.text !== status) this.statusText.setText(status);
  }

  private showBanner(msg: string) {
    this.bannerText.setText(msg).setAlpha(1).setScale(0.6);
    this.tweens.killTweensOf(this.bannerText);
    this.tweens.add({ targets: this.bannerText, scale: 1, duration: 250, ease: "Back.Out" });
    this.tweens.add({ targets: this.bannerText, alpha: 0, delay: 1800, duration: 500 });
  }

  private confirmSurrender() {
    if (this.state.phase === "ended" || this.dialog.length || this.resultShown) return;
    this.selected = null;
    const d = 30;
    const shade = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0920, 0.6).setDepth(d).setInteractive();
    const panel = makePanel(this, GAME_W / 2, 700, 580, d);
    const q = this.add.text(GAME_W / 2, 650, "정말 기권할까요?", { fontFamily: FONT_TITLE, fontStyle: "bold", fontSize: "42px", color: CSS.ink }).setOrigin(0.5).setDepth(d);
    const objs: Phaser.GameObjects.GameObject[] = [shade, panel, q];
    const close = () => { objs.forEach((o) => o.destroy()); this.dialog = []; };
    const keep = makeButton(this, GAME_W / 2 - 130, 740, "계속하기", "blue", close, { width: 240, fontSize: 30, depth: d });
    const quit = makeButton(this, GAME_W / 2 + 130, 740, "기권", "red", () => {
      close();
      this.surrendered = true;
      if (this.session) this.session.surrender();
      else forfeit(this.state, this.me);
    }, { width: 240, fontSize: 30, depth: d });
    objs.push(keep.bg, keep.text, quit.bg, quit.text);
    this.dialog = objs;
  }

  private endReasonText(): string {
    const r = this.session?.endReason;
    if (r) {
      const mine = r.loser === this.me;
      if (r.reason === "surrender") return mine ? "기권했습니다" : "상대가 기권했습니다";
      return mine ? "연결이 끊겨 패배 처리되었습니다" : "상대의 연결이 끊어졌습니다";
    }
    return this.surrendered ? "기권했습니다" : "";
  }

  private showDisconnected() {
    if (this.resultShown) return;
    this.resultShown = true;
    this.selected = null;
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0920, 0.7).setDepth(20).setInteractive();
    makePanel(this, GAME_W / 2, 680, 580, 20);
    this.add.text(GAME_W / 2, 650, "연결이 끊어졌습니다", { fontFamily: FONT_TITLE, fontStyle: "bold", fontSize: "44px", color: CSS.ink }).setOrigin(0.5).setDepth(21);
    makeButton(this, GAME_W / 2, 900, "메뉴로", "gold", () => this.scene.start("Menu"), { width: 420, depth: 21 });
  }

  // ---------- effects ----------

  private ring(x: number, y: number, r: number, ttl: number, color: number) {
    this.effects.push({ kind: "ring", x, y, r, ttl, max: ttl, color });
  }

  private burst(x: number, y: number, n: number, speed: number, colors: number[], size: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      const ttl = 0.35 + Math.random() * 0.35;
      this.effects.push({ kind: "frag", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: size * (0.6 + Math.random() * 0.6), ttl, max: ttl, color: colors[i % colors.length] });
    }
  }

  /** Art book explosion sheet (6 frames), sized to the blast radius in tiles. */
  private explosion(x: number, y: number, radius: number) {
    if (!this.anims.exists("fx_explosion")) { this.ring(x, y, radius, 0.4, 0xffd23f); return; }
    const [sx, sy] = this.toScreen(x, y);
    const fx = this.add.sprite(sx, sy, "fx_explosion").setDepth(4).setScale((radius * TILE * 2.3) / 160);
    fx.play("fx_explosion").once("animationcomplete", () => fx.destroy());
  }

  private onEvent(ev: GameEvent) {
    const mine = ev.owner === this.me;
    if (ev.type === "spell") {
      this.explosion(ev.x, ev.y, ev.radius);
      this.burst(ev.x, ev.y, 14, 7, [0xffd166, 0xff9e7a, 0xfff1c8], 8);
      this.cameras.main.shake(180, 0.006);
      play("spell");
    } else if (ev.type === "splash") {
      this.explosion(ev.x, ev.y, ev.radius * 0.8);
      play("boom");
    } else if (ev.type === "death") {
      if (ev.kind === "tower") {
        this.explosion(ev.x, ev.y, 2.6);
        this.burst(ev.x, ev.y, 26, 8, [0xc9c3df, 0x8e86b5, mine ? COLORS.me : COLORS.enemy], 11);
        this.cameras.main.shake(400, 0.014);
        play("towerDown");
        vibrate(mine ? 120 : 40);
      } else {
        this.explosion(ev.x, ev.y, 0.55);
      }
    }
  }

  // ---------- rendering ----------

  private render(alpha: number) {
    const g = this.dyn, top = this.top;
    g.clear();
    top.clear();
    const seen = new Set<number>();
    for (const e of this.state.entities) {
      seen.add(e.id);
      this.drawEntity(e, alpha);
    }
    for (const [id, spr] of this.sprites) if (!seen.has(id)) { spr.destroy(); this.sprites.delete(id); }
    for (const [id, fx] of this.deployFx) if (!seen.has(id)) { fx.destroy(); this.deployFx.delete(id); }
    for (const [id, t] of this.hpTexts) if (!seen.has(id)) { t.destroy(); this.hpTexts.delete(id); }
    for (const id of this.lastHp.keys()) if (!seen.has(id)) { this.lastHp.delete(id); this.flashUntil.delete(id); }

    // projectiles from a small image pool
    const prs = this.state.projectiles;
    while (this.projPool.length < prs.length) this.projPool.push(this.add.image(0, 0, "px").setDepth(3.5).setScale(1 / TEX_SCALE));
    this.projPool.forEach((img, i) => {
      const pr = prs[i];
      if (!pr) { img.setVisible(false); return; }
      const key = projectileKey(projectileFor(pr.src));
      const [sx, sy] = this.toScreen(pr.x, pr.y);
      if (this.textures.exists(key)) {
        if (img.texture.key !== key) img.setTexture(key);
        img.setVisible(true).setPosition(sx, sy - 8).setAngle(img.angle + 8);
      } else {
        img.setVisible(false);
        top.fillStyle(pr.splash ? 0x2a2350 : 0xfff1c8).fillCircle(sx, sy - 6, pr.splash ? 8 : 5);
      }
    });

    const dt = this.game.loop.delta / 1000;
    this.effects = this.effects.filter((ef) => (ef.ttl -= dt) > 0);
    for (const ef of this.effects) {
      const k = ef.ttl / ef.max;
      if (ef.kind === "ring") {
        const [sx, sy] = this.toScreen(ef.x, ef.y);
        top.fillStyle(ef.color, 0.4 * k).fillCircle(sx, sy, ef.r * TILE * (1.2 - 0.4 * k));
        top.lineStyle(4, ef.color, k).strokeCircle(sx, sy, ef.r * TILE * (1.2 - 0.4 * k));
      } else {
        ef.x += ef.vx * dt;
        ef.y += ef.vy * dt;
        const [sx, sy] = this.toScreen(ef.x, ef.y);
        top.fillStyle(ef.color, k).fillCircle(sx, sy, ef.size * (0.5 + 0.5 * k));
      }
    }

    this.renderOverlay();
    this.renderUi();
  }

  private drawEntity(e: Entity, alpha: number) {
    const x = e.px + (e.x - e.px) * alpha;
    const y = e.py + (e.y - e.py) * alpha;
    const [sx, sy] = this.toScreen(x, y);
    const team: Team = e.owner === this.me ? 0 : 1;
    const teamColor = team === 0 ? COLORS.me : COLORS.enemy;
    const deploying = e.deployTimer > 0;
    const now = this.time.now;
    const key = e.kind === "tower" ? towerKey(e.cardId === "tower_main" ? "main" : "side", team) : unitKey(e.cardId, team);

    let spr = this.sprites.get(e.id);
    if (!spr) {
      spr = this.add.sprite(sx, sy, key).setScale(1 / TEX_SCALE);
      if (e.kind === "tower") spr.setOrigin(0.5, 0.55);
      this.sprites.set(e.id, spr);
      if (e.kind !== "tower") { spr.setScale(0.2 / TEX_SCALE); this.tweens.add({ targets: spr, scale: 1 / TEX_SCALE, duration: 220, ease: "Back.Out" }); }
    }
    const half = (spr.width / TEX_SCALE) / 2;

    // ground: team ring (keeps teams readable even where sprites have no team colour) + shadow
    if (e.kind !== "tower") {
      const rw = Math.max(e.radius * TILE * 2.1, 30), rh = rw * 0.38;
      const gy = sy + (e.air ? half * 0.75 : half * 0.62);
      this.dyn.fillStyle(0x000000, e.air ? 0.16 : 0.22).fillEllipse(sx, gy, rw, rh);
      this.dyn.lineStyle(3, teamColor, 0.95).strokeEllipse(sx, gy, rw, rh);
    }

    // deploy magic circle while the unit is materialising
    let circle = this.deployFx.get(e.id);
    if (deploying && e.kind !== "tower" && this.anims.exists("fx_deploy")) {
      if (!circle) {
        circle = this.add.sprite(sx, sy, "fx_deploy").setDepth(0.9).play("fx_deploy");
        circle.setScale(Math.max(e.radius * TILE * 2.8, 54) / 160);
        this.deployFx.set(e.id, circle);
      }
      circle.setPosition(sx, sy + half * 0.4);
    } else if (circle) { circle.destroy(); this.deployFx.delete(e.id); }

    // animation: walk while moving, attack loop while planted (in range of a target)
    let oy = 0;
    const [psx] = this.toScreen(e.px, e.py);
    const moving = Math.abs(e.x - e.px) + Math.abs(e.y - e.py) > 0.001;
    if (e.kind === "unit") {
      if (e.air) oy = -14 + Math.sin(now / 160 + e.id) * 4;
      if (hasAnim(this, key)) {
        const want = deploying ? null : moving ? walkAnim(key) : attackAnim(key);
        if (!want) spr.anims.stop();
        else if (spr.anims.currentAnim?.key !== want || !spr.anims.isPlaying) spr.play(want, true);
      } else if (moving) oy -= Math.abs(Math.sin(now / 90 + e.id)) * 5;
      if (Math.abs(sx - psx) > 0.05) spr.setFlipX(sx < psx);
    }
    spr.setPosition(sx, sy + oy);
    spr.setDepth(1 + (e.air ? 1 : 0) + sy / 10000);
    spr.setAlpha(deploying ? 0.55 : 1);

    // tint: hit flash > idle main tower > none
    if ((this.flashUntil.get(e.id) ?? 0) > now) spr.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (e.kind === "tower" && !isTowerActive(this.state, e)) spr.setTint(0x9d98b8).setTintMode(Phaser.TintModes.MULTIPLY);
    else spr.clearTint();

    // hp bar (towers always, others once damaged)
    const top = this.top;
    if (e.kind === "tower" || e.hp < e.maxHp) {
      const w = e.kind === "tower" ? (e.cardId === "tower_main" ? 112 : 88) : Math.max(36, half * 1.3);
      const barY = e.kind === "tower" ? sy - half * 1.08 : sy + oy - half - 6;
      top.fillStyle(COLORS.ink, 0.9).fillRoundedRect(sx - w / 2 - 3, barY - 3, w + 6, 14, 5);
      top.fillStyle(team === 0 ? COLORS.me : COLORS.enemy).fillRoundedRect(sx - w / 2, barY, Math.max(0, (w * e.hp) / e.maxHp), 8, 3);
    }
    if (e.kind === "tower") {
      let t = this.hpTexts.get(e.id);
      if (!t) {
        t = this.add.text(0, 0, "", { fontFamily: FONT_NUM, fontSize: "22px", color: "#ffffff" }).setOrigin(0.5).setStroke(CSS.ink, 5).setDepth(4);
        this.hpTexts.set(e.id, t);
      }
      const hp = String(Math.max(0, Math.ceil(e.hp)));
      if (t.text !== hp) t.setText(hp);
      t.setPosition(sx, sy - half * 1.08 - 16);
    }
  }

  private renderOverlay() {
    const o = this.overlay;
    o.clear();
    if (this.selected === null) return;
    const card = getCard(this.state.players[this.me].hand[this.selected]);

    if (card.type !== "spell") {
      // shade the area where units can't be placed
      o.fillStyle(0xff0000, 0.18);
      for (const lane of [0, 1] as const) {
        const x0 = lane === 0 ? 0 : ARENA_W / 2;
        const probeX = x0 + 1;
        const expanded = inDeployZone(this.state, this.me, probeX, this.me === 0 ? DEPLOY_EXPANDED_MIN_Y : ARENA_H - DEPLOY_EXPANDED_MIN_Y);
        const limit = expanded ? DEPLOY_EXPANDED_MIN_Y : DEPLOY_MIN_Y; // in my perspective
        const sx = this.me === 0 ? x0 * TILE : (ARENA_W / 2 - x0) * TILE;
        o.fillRect(sx, 0, (ARENA_W / 2) * TILE, limit * TILE);
      }
    }

    if (this.ghost) {
      const ok = canDeploy(this.state, this.me, this.selected, this.ghost.x, this.ghost.y).ok;
      const [sx, sy] = this.toScreen(this.ghost.x, this.ghost.y);
      const r = (card.type === "spell" ? card.spellRadius ?? 2 : Math.max(card.radius ?? 0.5, 0.6)) * TILE;
      o.fillStyle(ok ? 0xffffff : 0xff3333, 0.3).fillCircle(sx, sy, r);
      o.lineStyle(3, ok ? 0xffffff : 0xff3333, 0.9).strokeCircle(sx, sy, r);
      if (card.type !== "spell" && (card.range ?? 0) > 1.5) o.lineStyle(2, 0xffffff, 0.4).strokeCircle(sx, sy, (card.range ?? 0) * TILE);
    }
  }

  private renderUi() {
    const me = this.state.players[this.me];
    me.hand.forEach((id, i) => {
      this.slots[i].set(id);
      this.slots[i].setState(getCard(id).cost <= me.mana, this.selected === i);
    });
    this.nextSlot.set(me.next);
    this.nextSlot.setState(true, false);

    // ink (mana) bar
    const g = this.dyn;
    const bx = 82, by = MANA_Y, bw = GAME_W - bx - 24, bh = 26;
    g.fillStyle(0x0e0b22).fillRoundedRect(bx, by, bw, bh, 10);
    const filled = (bw * me.mana) / MANA_MAX;
    if (filled > 2) g.fillGradientStyle(0x6a3dd6, 0xb48cff, 0x6a3dd6, 0xb48cff, 1).fillRect(bx + 2, by + 2, filled - 4, bh - 4);
    g.lineStyle(2, 0x0e0b22, 0.9);
    for (let i = 1; i < MANA_MAX; i++) g.lineBetween(bx + (bw * i) / MANA_MAX, by, bx + (bw * i) / MANA_MAX, by + bh);
    g.lineStyle(3, COLORS.ink).strokeRoundedRect(bx, by, bw, bh, 10);
    const m = String(Math.floor(me.mana));
    if (this.manaText.text !== m) this.manaText.setText(m);

    const t = Math.ceil(timeLeft(this.state));
    const tStr = `${this.state.phase === "overtime" ? "연장 " : ""}${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
    if (this.timerText.text !== tStr) this.timerText.setText(tStr);
    this.timerText.setColor(t <= 10 ? "#c8442c" : this.state.time >= DOUBLE_MANA_AT ? "#7b4be0" : CSS.ribbon);
    const enemy = this.state.players[this.me === 0 ? 1 : 0];
    this.syncTag(this.crownText, `노을관 · 상대   파괴 ${enemy.crowns}`);
    this.syncTag(this.myTagText, `달빛관 · 나   파괴 ${me.crowns}`);
  }

  private showResult() {
    this.resultShown = true;
    this.selected = null;
    const w = this.state.winner;
    play(w === this.me ? "win" : w === "draw" ? "go" : "lose");
    const title = w === "draw" ? "무승부" : w === this.me ? "승리!" : "패배";
    const color = w === "draw" ? CSS.parchment : w === this.me ? CSS.gold : CSS.coral;
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0920, 0.65).setDepth(20).setInteractive();
    const titleText = this.add.text(GAME_W / 2, 430, title, { fontFamily: FONT_TITLE, fontStyle: "bold", fontSize: "110px", color })
      .setOrigin(0.5).setStroke(CSS.ink, 14).setDepth(22).setScale(0.3);
    this.tweens.add({ targets: titleText, scale: 1, duration: 450, ease: "Back.Out" });
    makePanel(this, GAME_W / 2, 650, 600, 20);
    const line = (y: number, text: string, size: number, col: string = CSS.ink, font = FONT) =>
      this.add.text(GAME_W / 2, y, text, { fontFamily: font, fontSize: `${size}px`, color: col, align: "center" }).setOrigin(0.5).setDepth(21);
    const me = this.state.players[this.me];
    const enemy = this.state.players[this.me === 0 ? 1 : 0];
    line(560, `부순 탑  ${me.crowns} : ${enemy.crowns}`, 40, CSS.ink, FONT_NUM);
    const reason = this.endReasonText();
    if (reason) line(612, reason, 26, "#6b5a3a");
    this.hideCardInfo();
    if (this.bot) saveProfile({ tutorialDone: true });
    if (this.session) {
      const result = w === "draw" ? "draw" : w === this.me ? "win" : "loss";
      const before = rankOf(getProfile().trophies).name;
      const delta = recordResult(result, this.session.vsAI);
      const now = getProfile();
      const r = rankOf(now.trophies);
      const sign = delta > 0 ? "+" : "";
      line(668, `트로피 ${sign}${delta}  →  ${now.trophies}${this.session.vsAI ? "  (AI 대전 절반)" : ""}`, 30, delta >= 0 ? "#8a5a00" : "#c8442c", FONT_NUM);
      if (r.name !== before) line(718, `${r.name} 등급 달성!`, 32, CSS.ink, FONT_TITLE).setFontStyle("bold");
    } else {
      line(668, `연습 · 봇 ${DIFF_NAME[this.difficulty]}`, 26, "#6b5a3a");
    }
    if (this.session) makeButton(this, GAME_W / 2, 920, "다시 매칭", "gold", () => this.scene.start("Lobby", { mode: "quick" }), { width: 460, depth: 21 });
    else makeButton(this, GAME_W / 2, 920, "다시 하기", "gold", () => this.scene.restart({ mode: this.bot ? "bot" : undefined, difficulty: this.difficulty }), { width: 460, depth: 21 });
    makeButton(this, GAME_W / 2, 1050, "메뉴로", "parchment", () => this.scene.start("Menu"), { width: 460, depth: 21 });
  }
}
