import * as Phaser from "phaser";
import type { BotDifficulty } from "@bf/shared";
import { COLORS, CSS, FONT, FONT_HAND, FONT_NUM, FONT_TITLE, GAME_H, GAME_W } from "../layout";
import { askRoomCode } from "../ui/codeInput";
import { pendingResumeToken } from "../net/session";
import { TEX_SCALE, unitKey } from "../art";
import { hasAnim, walkAnim } from "../assets";
import { isMuted, play, setMuted, unlockAudio } from "../audio";
import { getProfile, rankOf, saveProfile } from "../profile";
import { makeButton, makePanel } from "../ui/widgets";

export class MenuScene extends Phaser.Scene {
  private asking = false;
  private dialog: Phaser.GameObjects.GameObject[] = [];

  constructor() { super("Menu"); }

  create() {
    // page was reloaded mid-match: try to rejoin it
    if (pendingResumeToken()) { this.scene.start("Lobby", { mode: "resume" }); return; }
    this.dialog = [];
    this.input.on("pointerdown", () => unlockAudio());

    // night castle backdrop (art book)
    if (this.textures.exists("bg_menu")) this.add.image(0, 0, "bg_menu").setOrigin(0, 0).setDisplaySize(GAME_W, GAME_H);
    else this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLORS.uiDark);

    // students strolling on the hill
    const walkers: [string, 0 | 1, number, number][] = [["spearman", 0, 130, 1440], ["crossbow", 0, 230, 1470], ["shieldGiant", 1, 470, 1420], ["bombGoblin", 1, 590, 1465]];
    walkers.forEach(([id, team, x, y]) => {
      const key = unitKey(id, team);
      const spr = this.add.sprite(x, y, key).setScale(1.25 / TEX_SCALE).setFlipX(team === 1);
      if (hasAnim(this, key)) spr.play(walkAnim(key));
    });
    const batKey = unitKey("bats", 1);
    const bat = this.add.sprite(360, 1330, batKey).setScale(1.3 / TEX_SCALE);
    if (hasAnim(this, batKey)) bat.play(walkAnim(batKey));
    this.tweens.add({ targets: bat, y: 1305, x: 385, duration: 900, yoyo: true, repeat: -1, ease: "Sine.InOut" });

    // logo
    this.add.text(GAME_W / 2, 118, "MONSTER ACADEMY  ·  BREAK FORT", { fontFamily: FONT_NUM, fontSize: "22px", color: CSS.gold }).setOrigin(0.5);
    const title = this.add.text(GAME_W / 2, 200, "몬스터 클래스", { fontFamily: FONT_TITLE, fontStyle: "bold", fontSize: "88px", color: "#fff6dc" })
      .setOrigin(0.5).setStroke("#3a2a6a", 12).setShadow(0, 6, "#3a2a6a", 0, true, true);
    this.tweens.add({ targets: title, scale: 1.03, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.InOut" });

    // student card (profile)
    const p = getProfile();
    const r = rankOf(p.trophies);
    this.add.rectangle(GAME_W / 2, 360, 560, 140, COLORS.ui, 0.82).setStrokeStyle(3, COLORS.gold, 0.7);
    this.add.text(GAME_W / 2, 322, `${r.name}  ·  트로피 ${p.trophies}`, { fontFamily: FONT_NUM, fontSize: "34px", color: r.color }).setOrigin(0.5);
    const streak = p.streak >= 2 ? `  ·  ${p.streak}연승 중!` : "";
    this.add.text(GAME_W / 2, 370, `${p.wins}승 ${p.losses}패${p.draws ? ` ${p.draws}무` : ""}${streak}`, { fontFamily: FONT, fontSize: "26px", color: CSS.text }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 406, r.next ? `${r.next.name}까지 ${r.next.need}` : "최고 등급 달성", { fontFamily: FONT, fontSize: "22px", color: CSS.dim }).setOrigin(0.5);

    const btn = (y: number, label: string, style: "gold" | "blue" | "parchment" | "red", fn: () => void) =>
      makeButton(this, GAME_W / 2, y, label, style, () => { if (!this.dialog.length) fn(); }, { width: 540 });
    btn(530, "빠른 매칭", "gold", () => this.scene.start("Lobby", { mode: "quick" }));
    btn(650, "친구 대전: 방 만들기", "blue", () => this.scene.start("Lobby", { mode: "create" }));
    btn(770, "친구 대전: 코드 입력", "parchment", async () => {
      if (this.asking) return;
      this.asking = true;
      const code = await askRoomCode();
      this.asking = false;
      if (code) this.scene.start("Lobby", { mode: "join", code });
    });
    btn(890, "연습 대전 (vs 봇)", "parchment", () => this.pickDifficulty());
    btn(1010, "덱 편집", "blue", () => this.scene.start("Deck"));
    if (!p.tutorialDone) {
      // "start here" badge on the practice button
      const hint = this.add.text(GAME_W / 2 + 248, 866, "추천", { fontFamily: FONT_NUM, fontSize: "24px", color: CSS.ink, backgroundColor: CSS.gold, padding: { x: 10, y: 4 } }).setOrigin(1, 0.5).setDepth(2);
      this.tweens.add({ targets: hint, scale: 1.12, duration: 500, yoyo: true, repeat: -1 });
    }

    // sound toggle
    const label = () => (isMuted() ? "소리 끔" : "소리 켬");
    const sbg = this.add.rectangle(GAME_W - 84, 44, 140, 52, COLORS.ui, 0.8).setStrokeStyle(2, COLORS.gold, 0.6).setInteractive({ useHandCursor: true });
    const stxt = this.add.text(GAME_W - 84, 44, label(), { fontFamily: FONT_NUM, fontSize: "24px", color: CSS.parchment }).setOrigin(0.5);
    sbg.on("pointerup", () => { setMuted(!isMuted()); stxt.setText(label()); play("select"); });

    this.add.text(GAME_W / 2, 1105, "카드를 끌어서 내 진영에 놓으세요", { fontFamily: FONT_HAND, fontStyle: "bold", fontSize: "30px", color: CSS.dim }).setOrigin(0.5);
  }

  private pickDifficulty() {
    if (this.dialog.length) return;
    const d = 30;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const close = () => { objs.forEach((o) => o.destroy()); this.dialog = []; };
    objs.push(
      this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0920, 0.65).setDepth(d).setInteractive().on("pointerup", close),
      makePanel(this, GAME_W / 2, 760, 640, d).setInteractive(),
      this.add.text(GAME_W / 2, 610, "연습 상대 고르기", { fontFamily: FONT_TITLE, fontStyle: "bold", fontSize: "42px", color: CSS.ink }).setOrigin(0.5).setDepth(d),
    );
    const opts: [BotDifficulty, string, string, "blue" | "gold" | "red"][] = [
      ["easy", "쉬움", "규칙을 익히기 좋아요", "blue"],
      ["normal", "보통", "적당한 상대", "gold"],
      ["hard", "어려움", "빠르게 반응하고 몰아붙여요", "red"],
    ];
    const last = getProfile().difficulty;
    opts.forEach(([diff, label, sub, style], i) => {
      const y = 690 + i * 92;
      const b = makeButton(this, GAME_W / 2 - 70, y, label, style, () => {
        saveProfile({ difficulty: diff });
        this.scene.start("Battle", { mode: "bot", difficulty: diff });
      }, { width: 300, fontSize: 30, depth: d });
      objs.push(b.bg, b.text, this.add.text(GAME_W / 2 + 90, y, (diff === last ? "최근 선택 · " : "") + sub, { fontFamily: FONT, fontSize: "20px", color: "#5a4a2a", wordWrap: { width: 170 } }).setOrigin(0, 0.5).setDepth(d));
    });
    this.dialog = objs;
  }
}
